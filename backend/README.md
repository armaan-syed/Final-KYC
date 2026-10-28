# Pramāṇa — Person B Backend (FastAPI + PostgreSQL + Cognito)

This is Person B's implementation of the Pramāṇa KYC verification system backend.

## What This Covers

FastAPI application with PostgreSQL data layer, Cognito authentication, customer/KYC/reviewer API routes, presigned S3 URLs, SQS integration for the OCR worker, audit trail, and notification service interface.

## Project Structure

```
backend/
  app/
    main.py               ← FastAPI app + Mangum Lambda handler
    config.py             ← Pydantic settings from environment variables
    database.py           ← SQLAlchemy engine + session factory
    dependencies.py       ← get_db, get_current_customer, get_current_reviewer
    models/
      customer.py         ← Customer ORM model
      kyc.py              ← KYCCase, KYCAttempt, KYCDocument, KYCDecision
      verification.py     ← ExtractedField, FieldComparison
      audit.py            ← AuditEvent
      reviewer.py         ← Reviewer
    schemas/
      auth.py             ← Auth request/response Pydantic models
      customer.py         ← Customer profile & KYC status schemas
      kyc.py              ← Upload URL, submit, attempts schemas
      verification.py     ← OCR worker message contract (shared with Person A)
      reviewer.py         ← Reviewer dashboard, queue, decision, audit schemas
    routers/
      auth.py             ← POST /auth/register, confirm, login, refresh, logout
      customer.py         ← GET/PUT /customer/profile, GET /customer/kyc/status
      kyc.py              ← POST /kyc/upload-url, submit, GET /kyc/attempts
      reviewer.py         ← GET /reviewer/dashboard, queue, cases, decide, audit
    services/
      cognito.py          ← Cognito JWT verification (JWKS, RS256)
      s3.py               ← Presigned PUT/GET URLs, server-derived S3 keys
      sqs.py              ← OCR worker job enqueueing
      notification.py     ← SNS (SMS) + SES (email) sending + templates
      kyc_service.py      ← KYC business logic (case lifecycle, decisions, audit)
  migrations/
    env.py                ← Alembic environment
    versions/
      001_initial_schema.py  ← Initial database migration
  requirements.txt        ← Python dependencies
  .env.example            ← Environment variable template (copy to .env)
  .env                    ← Local development values (git-ignored, DO NOT COMMIT)
  template.yaml           ← Backend/API SAM component (integrate with Person A)
  infrastructure/
    database.yaml         ← Private RDS component; requires Person A network outputs/review
  alembic.ini             ← Alembic configuration
```

## API Endpoints

### Auth (public)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register new customer in Cognito |
| POST | `/auth/confirm` | Confirm registration + create RDS customer row |
| POST | `/auth/login` | Login — returns Cognito tokens |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Sign out (requires customer JWT) |

### Customer (customer JWT)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/customer/profile` | Get customer profile |
| PUT | `/customer/profile` | Update profile |
| GET | `/customer/kyc/status` | Get KYC case status + latest attempt |

### KYC (customer JWT)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/kyc/upload-url` | Get presigned S3 URL, allocate attempt |
| POST | `/kyc/submit` | Submit document, enqueue OCR job via SQS |
| GET | `/kyc/attempts` | List attempt history |

### Reviewer (reviewer JWT)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/reviewer/dashboard` | Summary counts |
| GET | `/reviewer/queue` | Paginated cases needing review |
| GET | `/reviewer/cases` | All cases with filters |
| GET | `/reviewer/cases/{case_id}` | Full case detail + presigned doc URL |
| POST | `/reviewer/cases/{case_id}/decide` | APPROVED / REJECTED / REUPLOAD_REQUESTED |
| GET | `/reviewer/cases/{case_id}/audit` | Audit trail |

## Database Schema

```
customers
  └── kyc_cases (one per customer, unique)
        └── kyc_attempts (one to many, attempt_number unique per case)
              ├── kyc_documents (one per attempt)
              ├── extracted_fields (many per attempt)
              ├── field_comparisons (many per attempt)
              └── kyc_decisions (one per attempt)

audit_events (append-only, references cases and attempts)
reviewers (separate Cognito pool)
```

## Status Values

**KYC Case:** PENDING, PROCESSING, AUTO_VERIFIED, APPROVED, REJECTED, REUPLOAD_PENDING

**KYC Attempt:** PROCESSING, AUTO_VERIFIED, REVIEW_REQUIRED, APPROVED, REJECTED, REUPLOAD_REQUESTED

## SQS Message (to Person A's OCR worker)

```json
{
  "kyc_attempt_id": "uuid",
  "kyc_case_id": "uuid",
  "customer_id": "uuid",
  "s3_bucket": "bucket-name",
  "s3_key": "documents/{customer_id}/{attempt_id}/{file}",
  "document_type": "AADHAAR" | "PAN"
}
```

## Local Development

```bash
cd backend

# 1. Copy env template and fill in local/test values (never use these defaults in AWS)
cp .env.example .env

# 2. Install application and test dependencies, then the shared notification package
pip install -r requirements-dev.txt
pip install -e ../infra/shared

# 3. Run migrations (requires PostgreSQL)
alembic upgrade head

# 4. Start the API locally
uvicorn app.main:app --reload --port 8000

# 5. Test with SAM local (simulates Lambda)
sam local start-api
```

## Database and deployment integration

The database component template is `infrastructure/database.yaml`. It creates a
private encrypted PostgreSQL instance, RDS-managed master credentials in Secrets
Manager, and a DB subnet group. It intentionally consumes rather than creates
the shared VPC and database security group. The dev stack is now deployed as
`pramana-dev-database`; current non-secret outputs are in
[`COGNITO_OUTPUTS.md`](COGNITO_OUTPUTS.md) and
[`IMPLEMENTATION_HANDOFF.md`](IMPLEMENTATION_HANDOFF.md). The instance is
`db.t4g.micro`, 20 GiB, single-AZ, and has one-day automated backup retention to
fit the account's Free Plan. It is encrypted and not publicly accessible.

The AWS-managed database secret is created, but private Lambdas cannot retrieve
it or call Cognito/SQS/SNS/SES until Person A adds and approves the required VPC
interface endpoints. The local workstation also has no private route to RDS, so
the Alembic migration is not yet applied. Do not deploy the API/worker before
that connectivity and migration step are complete.

For any new environment, obtain and review:

- At least two private subnet IDs in different Availability Zones.
- A database security group allowing TCP 5432 only from approved application
  security groups (backend and OCR worker as needed).
- Person A's approved stack/deployment path and a reviewed change set.
- An explicitly accepted DB instance class and cost estimate.

Deploy the database component first, then apply `alembic upgrade head` from a
controlled migration runner, then deploy the API/worker components. Do not run
migrations in Lambda startup. Pass only the database endpoint/name and secret
ARN to the backend component; the Lambda retrieves credentials from Secrets
Manager using its scoped IAM permission. The database password is never an
ordinary CloudFormation parameter or source-controlled setting.

`template.yaml` consumes the database secret ARN, private subnet IDs, backend
Lambda security group, SQS queue ARN/URL, SES identity ARN, Cognito settings,
and Person A's shared notifications layer ARN. It does not create a duplicate
notifications layer. It is a component template, not approval to deploy a
second shared network stack. Confirm the root-template/API Gateway authorizer
design with Person A before integration.

## Coordination with Person A

Before deploying, coordinate these non-secret outputs and references:
- From A: VPC ID, private subnet IDs in two Availability Zones, database security
  group ID, backend/worker security group IDs, document bucket name/ARN, standard
  SQS queue URL/ARN, and `us-east-1` region.
- From B: RDS endpoint/port/database name and Secrets Manager ARN, Cognito
  customer/reviewer pool and app-client IDs, SES sender identity, and API outputs.
- SMS is direct-to-phone through the shared notification module; do not use the
  foundation alarm topic for customer notifications. SES sender identity is
  still pending a verified sender address/domain.

The RDS endpoint and secret ARN are supplied by the Person B database stack.
Never put the database password in this README, chat, or source control.

## Security

- `.env` is git-ignored — never commit real credentials
- Cognito secrets are never in `NEXT_PUBLIC_*` variables
- S3 keys are server-derived (no client-controlled paths)
- Presigned URLs are short-lived
- JWTs verified via Cognito JWKS with issuer/audience/expiry checks
- Audit events are append-only (no update/delete endpoints)
- Rejection SMS contains no sensitive details (portal-only)
