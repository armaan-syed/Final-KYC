# Pramāṇa — Person B Workload
## FastAPI Backend · PostgreSQL Schema · Verification Engine Integration · Cognito Auth

> Person B owns the brain of the system — the API layer and the data layer. You define the database schema, write all FastAPI endpoints, integrate Cognito authentication, and provide the API contract that Person C (frontend) consumes. You do not provision AWS infrastructure (Person A does that), but you deploy your Lambda function through the SAM template Person A manages.

---

## Your Responsibilities at a Glance

| Area | What You Own |
|---|---|
| FastAPI application | All API routes, request/response models, business logic |
| Database schema | Full PostgreSQL schema — all tables, indexes, constraints |
| SQLAlchemy models | ORM models matching the schema |
| Cognito integration | JWT validation middleware, user identity extraction |
| Customer endpoints | Registration, login flow, profile, KYC status |
| Document upload | Presigned URL generation, upload initiation |
| KYC case management | Case creation, attempt tracking, status updates |
| Reviewer endpoints | Dashboard data, case detail, decision submission |
| Audit trail | Writing audit events on every reviewer action |
| Notification trigger | Calling SNS/SES after verification decisions |
| DB migrations | Alembic migration files |

---

## 1. Tech Stack

| Tool | Version | Purpose |
|---|---|---|
| Python | 3.11 | Runtime |
| FastAPI | latest | Web framework |
| Mangum | latest | ASGI adapter — wraps FastAPI for Lambda |
| SQLAlchemy | 2.x | ORM |
| Alembic | latest | Database migrations |
| Pydantic | v2 | Request/response validation |
| python-jose | latest | JWT decoding (Cognito tokens) |
| boto3 | latest | AWS SDK (S3 presigned URLs, SNS, SES) |
| psycopg2-binary | latest | PostgreSQL driver |
| python-dotenv | latest | Local environment variables |

---

## 2. Project Structure

```
backend/
  app/
    main.py               ← FastAPI app + Mangum handler
    config.py             ← Settings from environment variables
    database.py           ← SQLAlchemy engine + session
    dependencies.py       ← Shared FastAPI dependencies (auth, db session)
    models/
      customer.py         ← Customer ORM model
      kyc.py              ← KYC Case, Attempt, Document models
      verification.py     ← ExtractedField, FieldComparison models
      audit.py            ← AuditEvent model
    schemas/
      customer.py         ← Pydantic request/response schemas
      kyc.py
      verification.py
      reviewer.py
    routers/
      auth.py             ← /auth routes
      customer.py         ← /customer routes
      kyc.py              ← /kyc routes
      reviewer.py         ← /reviewer routes
    services/
      cognito.py          ← Cognito JWT validation
      s3.py               ← Presigned URL generation
      notification.py     ← SNS + SES sending
      kyc_service.py      ← KYC business logic
  migrations/
    env.py
    versions/
      001_initial_schema.py
  requirements.txt
  template.yaml           ← SAM template (coordinated with Person A)
```

---

## 3. Database Schema

### 3.1 Overview
```
customers
  └── kyc_cases (one per customer)
        └── kyc_attempts (one to many)
              ├── kyc_documents (one per attempt)
              ├── extracted_fields (many per attempt)
              ├── field_comparisons (many per attempt)
              └── kyc_decisions (one per attempt)

audit_events (append-only, references attempts and reviewers)
```

### 3.2 customers table
```sql
CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cognito_sub     VARCHAR(255) UNIQUE NOT NULL,  -- Cognito user ID
    full_name       VARCHAR(255) NOT NULL,
    date_of_birth   DATE NOT NULL,
    gender          VARCHAR(20) NOT NULL,          -- Male, Female, Other
    phone_number    VARCHAR(20) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    address_line1   VARCHAR(255) NOT NULL,
    address_line2   VARCHAR(255),
    city            VARCHAR(100) NOT NULL,
    state           VARCHAR(100) NOT NULL,
    pincode         VARCHAR(10) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_cognito_sub ON customers(cognito_sub);
CREATE INDEX idx_customers_email ON customers(email);
```

### 3.3 kyc_cases table
```sql
CREATE TABLE kyc_cases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID NOT NULL REFERENCES customers(id),
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    -- PENDING, PROCESSING, AUTO_VERIFIED, APPROVED, REJECTED, REUPLOAD_PENDING
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_customer_kyc_case UNIQUE (customer_id)  -- one active case per customer
);

CREATE INDEX idx_kyc_cases_customer_id ON kyc_cases(customer_id);
CREATE INDEX idx_kyc_cases_status ON kyc_cases(status);
```

### 3.4 kyc_attempts table
```sql
CREATE TABLE kyc_attempts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kyc_case_id     UUID NOT NULL REFERENCES kyc_cases(id),
    attempt_number  INTEGER NOT NULL,             -- 1, 2, 3...
    document_type   VARCHAR(20) NOT NULL,         -- AADHAAR, PAN
    status          VARCHAR(30) NOT NULL DEFAULT 'PROCESSING',
    -- PROCESSING, AUTO_VERIFIED, REVIEW_REQUIRED, APPROVED, REJECTED, REUPLOAD_REQUESTED
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    CONSTRAINT uq_attempt_number UNIQUE (kyc_case_id, attempt_number)
);

CREATE INDEX idx_kyc_attempts_case_id ON kyc_attempts(kyc_case_id);
CREATE INDEX idx_kyc_attempts_status ON kyc_attempts(status);
```

### 3.5 kyc_documents table
```sql
CREATE TABLE kyc_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id      UUID NOT NULL REFERENCES kyc_attempts(id) UNIQUE,
    s3_bucket       VARCHAR(255) NOT NULL,
    s3_key          VARCHAR(1024) NOT NULL,
    file_name       VARCHAR(255) NOT NULL,
    file_size_bytes INTEGER,
    content_type    VARCHAR(100),
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.6 extracted_fields table
```sql
CREATE TABLE extracted_fields (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id      UUID NOT NULL REFERENCES kyc_attempts(id),
    field_name      VARCHAR(100) NOT NULL,  -- name, date_of_birth, gender, etc.
    raw_value       TEXT,                   -- raw OCR output for this field
    normalized_value TEXT,                  -- after normalization
    confidence      FLOAT,                  -- OCR confidence score if available
    extracted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_extracted_fields_attempt_id ON extracted_fields(attempt_id);
```

### 3.7 field_comparisons table
```sql
CREATE TABLE field_comparisons (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id          UUID NOT NULL REFERENCES kyc_attempts(id),
    field_name          VARCHAR(100) NOT NULL,
    customer_value      TEXT,
    document_value      TEXT,
    is_match            BOOLEAN NOT NULL,
    compared_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_field_comparisons_attempt_id ON field_comparisons(attempt_id);
```

### 3.8 kyc_decisions table
```sql
CREATE TABLE kyc_decisions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id      UUID NOT NULL REFERENCES kyc_attempts(id) UNIQUE,
    decision        VARCHAR(30) NOT NULL,
    -- AUTO_VERIFIED, APPROVED, REJECTED, REUPLOAD_REQUESTED
    decided_by      VARCHAR(255),           -- 'SYSTEM' or reviewer cognito_sub
    decided_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes           TEXT                    -- reviewer notes if any
);
```

### 3.9 audit_events table
```sql
CREATE TABLE audit_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kyc_case_id     UUID NOT NULL REFERENCES kyc_cases(id),
    attempt_id      UUID REFERENCES kyc_attempts(id),
    actor           VARCHAR(255) NOT NULL,  -- 'SYSTEM' or reviewer cognito_sub
    action          VARCHAR(100) NOT NULL,
    -- SUBMITTED, PROCESSING_STARTED, AUTO_VERIFIED, REVIEW_REQUIRED,
    -- REVIEWER_APPROVED, REVIEWER_REJECTED, REUPLOAD_REQUESTED, NOTIFICATION_SENT
    details         JSONB,                  -- additional context (field name, values)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_events_case_id ON audit_events(kyc_case_id);
CREATE INDEX idx_audit_events_created_at ON audit_events(created_at);
```

### 3.10 reviewers table
```sql
CREATE TABLE reviewers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cognito_sub     VARCHAR(255) UNIQUE NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. FastAPI Application

### 4.1 Entry Point (main.py)
```python
from fastapi import FastAPI
from mangum import Mangum
from app.routers import auth, customer, kyc, reviewer

app = FastAPI(title="Pramāṇa API", version="1.0.0")

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(customer.router, prefix="/customer", tags=["customer"])
app.include_router(kyc.router, prefix="/kyc", tags=["kyc"])
app.include_router(reviewer.router, prefix="/reviewer", tags=["reviewer"])

# Mangum wraps FastAPI for Lambda
handler = Mangum(app, lifespan="off")
```

### 4.2 Auth Dependency (dependencies.py)
```python
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.services.cognito import verify_token

security = HTTPBearer()

async def get_current_customer(
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: Session = Depends(get_db)
) -> Customer:
    payload = verify_token(credentials.credentials, user_pool="customers")
    customer = db.query(Customer).filter_by(cognito_sub=payload["sub"]).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer

async def get_current_reviewer(
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: Session = Depends(get_db)
) -> Reviewer:
    payload = verify_token(credentials.credentials, user_pool="reviewers")
    reviewer = db.query(Reviewer).filter_by(cognito_sub=payload["sub"]).first()
    if not reviewer:
        raise HTTPException(status_code=403, detail="Not authorized as reviewer")
    return reviewer
```

---

## 5. API Endpoints

### 5.1 Auth Routes (`/auth`)

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/auth/register` | Register new customer | None |
| POST | `/auth/confirm` | Confirm registration (Cognito OTP) | None |
| POST | `/auth/login` | Login — returns Cognito tokens | None |
| POST | `/auth/refresh` | Refresh access token | None |
| POST | `/auth/logout` | Logout (invalidate refresh token) | Customer JWT |

**POST /auth/register**
```json
Request:
{
  "full_name": "ARMAAN SYED",
  "date_of_birth": "2007-02-15",
  "gender": "Male",
  "phone_number": "+919876543210",
  "email": "armaan@example.com",
  "password": "SecurePass@123",
  "address_line1": "123 Marine Lines",
  "address_line2": "Flat 4B",
  "city": "Mumbai",
  "state": "Maharashtra",
  "pincode": "400020"
}

Response 201:
{
  "message": "Registration successful. Please verify your email.",
  "customer_id": "uuid"
}
```

### 5.2 Customer Routes (`/customer`)

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/customer/profile` | Get customer profile | Customer JWT |
| PUT | `/customer/profile` | Update profile | Customer JWT |
| GET | `/customer/kyc/status` | Get current KYC case status | Customer JWT |

**GET /customer/kyc/status**
```json
Response 200:
{
  "kyc_case_id": "uuid",
  "status": "REVIEW_REQUIRED",
  "latest_attempt": {
    "attempt_number": 1,
    "document_type": "AADHAAR",
    "submitted_at": "2026-10-28T10:30:00Z",
    "status": "REVIEW_REQUIRED",
    "field_comparisons": [
      { "field": "name", "is_match": true },
      { "field": "date_of_birth", "is_match": false },
      { "field": "gender", "is_match": true }
    ]
  },
  "rejection_reason": "Date of Birth mismatch"   // Only shown if REJECTED
}
```

### 5.3 KYC Routes (`/kyc`)

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/kyc/upload-url` | Get presigned S3 URL for document upload | Customer JWT |
| POST | `/kyc/submit` | Submit KYC after upload (creates attempt) | Customer JWT |
| GET | `/kyc/attempts` | List all attempts for customer's case | Customer JWT |

**POST /kyc/upload-url**
```json
Request:
{
  "document_type": "AADHAAR",
  "file_name": "aadhaar.jpg",
  "content_type": "image/jpeg"
}

Response 200:
{
  "upload_url": "https://s3.amazonaws.com/...",
  "s3_key": "documents/{customer_id}/{case_id}/{attempt_id}/original.jpg",
  "expires_in": 300
}
```

**POST /kyc/submit**
```json
Request:
{
  "s3_key": "documents/.../original.jpg",
  "document_type": "AADHAAR",
  "file_name": "aadhaar.jpg",
  "file_size_bytes": 245000
}

Response 201:
{
  "attempt_id": "uuid",
  "attempt_number": 1,
  "status": "PROCESSING",
  "message": "Document submitted. You will be notified once verification is complete."
}
```

### 5.4 Reviewer Routes (`/reviewer`)

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/reviewer/dashboard` | Dashboard summary counts | Reviewer JWT |
| GET | `/reviewer/queue` | Paginated list of cases needing review | Reviewer JWT |
| GET | `/reviewer/cases` | All cases with filters | Reviewer JWT |
| GET | `/reviewer/cases/{case_id}` | Full case detail | Reviewer JWT |
| POST | `/reviewer/cases/{case_id}/decide` | Submit decision | Reviewer JWT |
| GET | `/reviewer/cases/{case_id}/audit` | Audit trail for a case | Reviewer JWT |

**GET /reviewer/dashboard**
```json
Response 200:
{
  "pending_review": 7,
  "auto_verified_today": 12,
  "approved_today": 3,
  "rejected_today": 1,
  "total_cases": 45
}
```

**GET /reviewer/queue**
```json
Response 200:
{
  "cases": [
    {
      "kyc_case_id": "uuid",
      "customer_name": "ARMAAN SYED",
      "document_type": "AADHAAR",
      "submitted_at": "2026-10-28T10:30:00Z",
      "mismatched_fields": ["date_of_birth"],
      "attempt_number": 1
    }
  ],
  "total": 7,
  "page": 1,
  "page_size": 20
}
```

**GET /reviewer/cases/{case_id}**
```json
Response 200:
{
  "kyc_case_id": "uuid",
  "customer": {
    "full_name": "ARMAAN SYED",
    "date_of_birth": "2007-02-15",
    "gender": "Male",
    "address": "123 Marine Lines, Mumbai, Maharashtra 400020"
  },
  "latest_attempt": {
    "attempt_number": 2,
    "document_type": "AADHAAR",
    "document_url": "https://presigned-s3-url...",   // Short-lived presigned GET URL
    "extracted_fields": {
      "name": "ARMAAN SYED",
      "date_of_birth": "15/02/2006",
      "gender": "Male"
    },
    "field_comparisons": [
      {
        "field": "name",
        "customer_value": "ARMAAN SYED",
        "document_value": "ARMAAN SYED",
        "is_match": true
      },
      {
        "field": "date_of_birth",
        "customer_value": "15/02/2007",
        "document_value": "15/02/2006",
        "is_match": false
      },
      {
        "field": "gender",
        "customer_value": "Male",
        "document_value": "Male",
        "is_match": true
      }
    ]
  },
  "attempt_history": [
    { "attempt_number": 1, "status": "REUPLOAD_REQUESTED", "submitted_at": "..." },
    { "attempt_number": 2, "status": "REVIEW_REQUIRED", "submitted_at": "..." }
  ],
  "audit_trail": [...]
}
```

**POST /reviewer/cases/{case_id}/decide**
```json
Request:
{
  "decision": "REJECTED",   // APPROVED | REJECTED | REUPLOAD_REQUESTED
  "notes": "Date of birth mismatch — document shows 2006, registered as 2007."
}

Response 200:
{
  "message": "Decision recorded.",
  "decision": "REJECTED",
  "decided_at": "2026-10-28T10:42:31Z"
}
```

---

## 6. OCR Worker Integration

The OCR Worker Lambda (Person A's code) writes directly to the database after extraction and verification. You must agree on the exact table/column names and provide Person A with:

### 6.1 What Person A writes to RDS
After OCR and verification, Person A's Lambda writes:
- `extracted_fields` rows — one per extracted field
- `field_comparisons` rows — one per compared field
- Updates `kyc_attempts.status` to `AUTO_VERIFIED` or `REVIEW_REQUIRED`
- Updates `kyc_attempts.completed_at`
- Updates `kyc_cases.status` to match
- Creates a `kyc_decisions` row if AUTO_VERIFIED
- Creates an `audit_events` row

### 6.2 SQS Message You Send (POST /kyc/submit)
When the customer submits their document, your API sends this message to SQS:
```python
sqs.send_message(
    QueueUrl=settings.SQS_QUEUE_URL,
    MessageBody=json.dumps({
        "kyc_attempt_id": str(attempt.id),
        "kyc_case_id": str(kyc_case.id),
        "customer_id": str(customer.id),
        "s3_bucket": settings.S3_DOCUMENTS_BUCKET,
        "s3_key": document.s3_key,
        "document_type": attempt.document_type  # "AADHAAR" or "PAN"
    })
)
```

---

## 7. Cognito Integration

### 7.1 JWT Verification
```python
import requests
from jose import jwt, JWTError
from app.config import settings

def get_jwks(user_pool_id: str, region: str) -> dict:
    url = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json"
    return requests.get(url).json()

def verify_token(token: str, user_pool: str) -> dict:
    pool_id = settings.COGNITO_CUSTOMER_POOL_ID if user_pool == "customers" \
              else settings.COGNITO_REVIEWER_POOL_ID
    jwks = get_jwks(pool_id, settings.AWS_REGION)

    try:
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            audience=settings.COGNITO_APP_CLIENT_ID,
            options={"verify_exp": True}
        )
        return payload
    except JWTError as e:
        raise HTTPException(status_code=401, detail="Invalid token")
```

### 7.2 Registration Flow
Cognito handles the password hashing and email verification. Your API:
1. Calls `cognito.sign_up()` with email, password, and attributes
2. Cognito sends a verification code to the customer's email
3. Customer submits the code to `/auth/confirm`
4. Your API calls `cognito.confirm_sign_up()`
5. After confirmation, creates the `customers` row in RDS

---

## 8. Notification Service

### 8.1 Your Role
The OCR Worker (Person A) triggers notifications after a decision. However, you provide the `notification.py` service module that Person A imports and calls.

```python
import boto3
from app.config import settings

sns = boto3.client('sns', region_name=settings.AWS_REGION)
ses = boto3.client('ses', region_name=settings.AWS_REGION)

def send_sms(phone_number: str, message: str):
    sns.publish(
        PhoneNumber=phone_number,
        Message=message
    )

def send_email(to_email: str, subject: str, body_html: str, body_text: str):
    ses.send_email(
        Source=settings.SES_SENDER_EMAIL,
        Destination={"ToAddresses": [to_email]},
        Message={
            "Subject": {"Data": subject},
            "Body": {
                "Text": {"Data": body_text},
                "Html": {"Data": body_html}
            }
        }
    )
```

---

## 9. Interfaces with Person A and Person C

### 9.1 From Person A — Values You Need
Before you can run locally or deploy, you need from Person A:
- `RDS_HOST`, `RDS_PORT`, `RDS_DB_NAME`, `RDS_USERNAME`, `RDS_PASSWORD`
- `COGNITO_CUSTOMER_POOL_ID`, `COGNITO_REVIEWER_POOL_ID`
- `COGNITO_APP_CLIENT_ID`
- `S3_DOCUMENTS_BUCKET`
- `SQS_QUEUE_URL`
- `SNS_TOPIC_ARN`
- `SES_SENDER_EMAIL`
- `AWS_REGION`

Store these in `.env` locally (git-ignored) and in Lambda environment variables for deployment.

### 9.2 What You Provide to Person C
Person C (frontend) consumes your API. Provide them:
- Complete API base URL (`https://{api-gateway-id}.execute-api.{region}.amazonaws.com`)
- All endpoint paths, methods, request/response schemas (this document is their reference)
- Cognito User Pool ID + App Client ID (for their auth SDK)
- Any error codes and their meanings

### 9.3 Critical Shared Contract: Upload Flow
The presigned URL upload flow is a three-way interaction:
1. Person C calls `POST /kyc/upload-url` → you return a presigned S3 URL
2. Person C uploads the file directly to S3 using that URL
3. Person C calls `POST /kyc/submit` → you write to DB and enqueue SQS message
4. Person A's OCR Worker picks up from SQS and begins processing

This must be tested end-to-end with all three people.

---

## 10. Build Order for Person B

1. Set up FastAPI project structure + virtualenv + requirements.txt
2. Implement `database.py` — SQLAlchemy engine + session factory
3. Write all SQLAlchemy models (customers, kyc_cases, kyc_attempts, etc.)
4. Write Alembic migration — `001_initial_schema.py`
5. Run migration against RDS (coordinate with Person A for RDS access)
6. Implement `config.py` — all settings from env vars
7. Implement Cognito JWT verification (`services/cognito.py`)
8. Implement `/auth` routes — register, confirm, login, refresh
9. Implement `/customer` routes — profile, KYC status
10. Implement `/kyc` routes — upload URL, submit
11. Implement SQS message sending in `/kyc/submit`
12. Implement `/reviewer` routes — dashboard, queue, case detail, decide
13. Implement audit event writing on every decision
14. Implement notification service (`services/notification.py`)
15. Wire Mangum handler in `main.py`
16. Local testing with SAM local
17. Deploy Lambda (coordinate with Person A for SAM deploy)

---

## 11. Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
cp .env.example .env
# Fill in values from Person A

# Run locally (without Lambda)
uvicorn app.main:app --reload --port 8000

# Test with SAM local (simulates Lambda + API Gateway)
sam local start-api

# Run migrations
alembic upgrade head
```
