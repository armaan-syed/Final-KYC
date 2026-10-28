# Pramāṇa — Person A Workload
## AWS Infrastructure · OCR Pipeline · Security · Deployment

> Person A owns the cloud backbone. This includes AWS infrastructure provisioning, IAM security, the Tesseract/OpenCV OCR pipeline, SNS/SES notifications, CloudWatch monitoring, and final deployment. Cognito user-pool and app-client setup is assigned to Person B; Person A wires those resources into API Gateway authorizers and the shared SAM infrastructure. Person A's work enables Person B (backend) and Person C (frontend) to function.

---

## Your Responsibilities at a Glance

| Area | What You Own |
|---|---|
| AWS Account & IAM | Account setup, IAM users for B and C, least-privilege policies |
| Infrastructure as Code | CDK or SAM — provision all AWS resources |
| S3 | Document bucket, frontend hosting bucket, bucket policies |
| SQS | OCR processing queue, dead-letter queue |
| Lambda OCR Worker | Tesseract + OpenCV Lambda Layer, OCR worker function |
| Document Parser | Aadhaar and PAN field extraction logic |
| Verification Engine | Field comparison logic, match scoring, result writing to RDS |
| SNS | SMS notification topics and subscriptions |
| SES | Email notification setup, templates |
| API Gateway | HTTP API, routes, Cognito authorizer wiring using resources configured by Person B |
| CloudWatch | Log groups, metric filters, alarms |
| RDS Security | VPC, security groups, RDS not publicly exposed |
| Deployment | CDK/SAM deploy scripts, environment configs |

---

## 1. AWS Account & IAM Setup

### 1.1 Your Responsibilities
You own the AWS root account and are responsible for:
- Enabling MFA on the root account immediately
- Creating an admin IAM user for your own day-to-day work (never use root for development)
- Creating IAM users for Person B and Person C with scoped permissions
- Never committing AWS credentials to git

### 1.2 IAM Users for Team Members

**Person B — Backend Developer**
Needs access to:
- RDS (read/write to the Pramāṇa database)
- Lambda (deploy and invoke backend functions)
- API Gateway (deploy and manage APIs)
- Cognito (manage the project's pools and app clients)
- S3 (read documents bucket — for local testing only)
- SQS (send/receive messages — for local testing)
- CloudWatch (read logs)
- Secrets Manager (read DB credentials secret)

**Person C — Frontend Developer**
Needs access to:
- S3 (deploy frontend to hosting bucket)
- CloudFront (create invalidations after frontend deploys)
- Cognito IDs are public configuration supplied by Person B; no Cognito management access is needed
- CloudWatch (read logs for frontend debugging)

### 1.3 IAM Policy Principle
Apply **least privilege** — each person gets only what they need for their specific tasks. Use IAM policies scoped to specific resource ARNs where possible (e.g., only the Pramāṇa S3 bucket, not all S3).

### 1.4 Secrets Management
- Database credentials → **AWS Secrets Manager** (never hardcoded)
- Environment variables for Lambda → encrypted via KMS
- No credentials in git under any circumstances
- `.env` files are local-only and git-ignored

---

## 2. Infrastructure as Code

### 2.1 Tooling Decision
Use **AWS SAM (Serverless Application Model)** for this project.
- Simpler than CDK for a primarily serverless stack
- Native support for Lambda, API Gateway, SQS, S3 events
- `sam deploy` for deployments
- `sam local` for local testing of Lambda functions

### 2.2 Resources You Provision (SAM template)
- S3 bucket — document storage (private, versioning enabled)
- S3 bucket — frontend hosting (public read, static website)
- SQS queue — OCR processing queue
- SQS queue — dead-letter queue (for failed OCR jobs)
- Lambda function — FastAPI backend (Person B's code)
- Lambda function — OCR worker (your code)
- Lambda Layer — Tesseract + OpenCV
- API Gateway HTTP API — connected to backend Lambda
- API Gateway JWT authorizers — configured from Person B's customer/reviewer Cognito pools and app clients
- RDS instance — PostgreSQL t3.micro (in VPC)
- VPC — private subnet for RDS, Lambda in VPC
- Security Groups — Lambda → RDS only, no public RDS access
- CloudWatch Log Groups — for all Lambda functions
- SNS Topic — customer SMS notifications
- SES — email sending configuration
- Secrets Manager — DB credentials secret

---

## 3. S3 Configuration

### 3.1 Document Storage Bucket
- **Name:** `pramana-documents-{account-id}`
- **Access:** Private (no public access, ever)
- **Versioning:** Enabled (preserves document history)
- **Encryption:** SSE-S3 (server-side encryption, no extra cost)
- **Lifecycle policy:** None needed for demo
- **Bucket policy:** Only the OCR Worker Lambda and Backend Lambda can access this bucket

**Object key structure:**
```
documents/
  {customer_id}/
    {kyc_case_id}/
      {attempt_id}/
        original.{jpg|png|pdf}
```

### 3.2 Presigned URLs
The backend Lambda (Person B) will call S3 to generate presigned upload URLs so the frontend can upload directly to S3 without routing the file through the API. You configure the bucket CORS policy to allow this.

**CORS policy for document bucket:**
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT"],
    "AllowedOrigins": ["https://your-cloudfront-domain.cloudfront.net"],
    "MaxAgeSeconds": 3600
  }
]
```

### 3.3 Frontend Hosting Bucket
- **Name:** `pramana-frontend-{account-id}`
- **Access:** Private (served via CloudFront only, not directly public)
- **CloudFront OAC:** Origin Access Control so only CloudFront can read the bucket
- **Static website hosting:** Disabled (use CloudFront, not S3 website endpoint)

---

## 4. SQS Configuration

### 4.1 OCR Processing Queue
- **Type:** Standard queue (not FIFO — ordering not required)
- **Visibility timeout:** 300 seconds (5 minutes — OCR can take time)
- **Message retention:** 4 days
- **Dead-letter queue:** After 3 failed attempts → move to DLQ

### 4.2 Dead-Letter Queue
- **Retention:** 14 days
- **CloudWatch alarm:** Alert when DLQ has > 0 messages (means OCR failures)

### 4.3 SQS → Lambda Trigger
The OCR Worker Lambda is triggered by SQS. Configure:
- Batch size: 1 (process one document at a time — OCR is CPU intensive)
- Maximum concurrency: 5 (prevent Lambda from spinning up too many OCR workers simultaneously)

---

## 5. Tesseract + OpenCV Lambda Layer (POC First)

### 5.1 This is the Critical Path
Before writing any other code, validate that Tesseract + OpenCV run correctly on Lambda. This is the only genuine technical risk in the entire architecture.

### 5.2 POC Checklist
- [ ] Compile or source Tesseract binary for Amazon Linux 2 (arm64 or x86_64 — match your Lambda architecture)
- [ ] Include English (`eng`) and Hindi (`hin`) Tesseract language data files
- [ ] Package OpenCV Python bindings for Lambda
- [ ] Zip everything into a Lambda Layer
- [ ] Verify total layer size < 250MB unzipped
- [ ] Deploy a test Lambda with the layer
- [ ] Run OCR on a sample Aadhaar image
- [ ] Run OCR on a sample PAN card image
- [ ] Measure execution time (target < 30 seconds, Lambda max timeout is 15 minutes)
- [ ] Validate raw text output is parseable

### 5.3 Layer Structure
```
layer/
  python/
    cv2/                  ← OpenCV Python bindings
    pytesseract/          ← pytesseract Python wrapper
  bin/
    tesseract             ← Tesseract binary (compiled for Amazon Linux 2)
  tessdata/
    eng.traineddata       ← English language data
    hin.traineddata       ← Hindi language data
```

### 5.4 Pre-built Layer Option
Use the publicly available Tesseract Lambda Layer maintained for Amazon Linux 2 as a starting point rather than compiling from scratch. Validate it works, then customise if needed.

---

## 6. OCR Worker Lambda

### 6.1 Trigger
SQS message containing:
```json
{
  "kyc_attempt_id": "uuid",
  "customer_id": "uuid",
  "s3_bucket": "pramana-documents-{account-id}",
  "s3_key": "documents/{customer_id}/{case_id}/{attempt_id}/original.jpg",
  "document_type": "AADHAAR" | "PAN"
}
```

### 6.2 Worker Steps
```
1. Receive SQS message
2. Download image from S3 to /tmp
3. Preprocess image with OpenCV
   - Convert to grayscale
   - Apply Gaussian blur (reduce noise)
   - Apply adaptive thresholding (improve contrast)
   - Deskew if needed
4. Run Tesseract OCR on preprocessed image
5. Pass raw text to Document Parser
6. Write extracted fields to RDS (via Person B's DB models)
7. Trigger Verification Engine
8. Write verification result to RDS
9. If AUTO_VERIFIED → publish to SNS topic
10. If REVIEW_REQUIRED → update RDS status (reviewer dashboard polls this)
11. Delete SQS message on success
12. On failure → let SQS retry (up to 3 times) → DLQ
```

### 6.3 OpenCV Preprocessing Pipeline
```python
import cv2
import numpy as np

def preprocess_image(image_path: str) -> np.ndarray:
    img = cv2.imread(image_path)
    # Grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Denoise
    denoised = cv2.fastNlMeansDenoising(gray, h=10)
    # Adaptive threshold
    thresh = cv2.adaptiveThreshold(
        denoised, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 11, 2
    )
    return thresh
```

### 6.4 Tesseract Invocation
```python
import pytesseract

def extract_text(preprocessed_image) -> str:
    custom_config = r'--oem 3 --psm 6'
    text = pytesseract.image_to_string(
        preprocessed_image,
        lang='eng',   # Use 'eng+hin' for Aadhaar
        config=custom_config
    )
    return text
```

---

## 7. Document Parser

### 7.1 Aadhaar Parser
Aadhaar cards contain (English section):
- Name (line after "Government of India" header)
- Date of Birth (labelled "DOB:" or "Date of Birth:")
- Gender (Male / Female / Transgender)
- Aadhaar Number (12-digit number, often formatted as XXXX XXXX XXXX)
- Address

```python
import re

def parse_aadhaar(raw_text: str) -> dict:
    fields = {}
    lines = [l.strip() for l in raw_text.split('\n') if l.strip()]

    # DOB — look for DOB: DD/MM/YYYY pattern
    dob_match = re.search(r'DOB[:\s]+(\d{2}/\d{2}/\d{4})', raw_text)
    if dob_match:
        fields['dob'] = dob_match.group(1)

    # Gender
    gender_match = re.search(r'\b(Male|Female|Transgender)\b', raw_text, re.IGNORECASE)
    if gender_match:
        fields['gender'] = gender_match.group(1).capitalize()

    # Aadhaar number — 12 digits possibly with spaces
    aadhaar_match = re.search(r'\b(\d{4}\s\d{4}\s\d{4})\b', raw_text)
    if aadhaar_match:
        fields['aadhaar_number'] = aadhaar_match.group(1).replace(' ', '')

    # Name — heuristic: line after "Government of India"
    for i, line in enumerate(lines):
        if 'government of india' in line.lower():
            if i + 1 < len(lines):
                fields['name'] = lines[i + 1].upper()
            break

    return fields
```

### 7.2 PAN Parser
PAN cards contain:
- Name
- Father's Name
- Date of Birth (DD/MM/YYYY)
- PAN Number (format: AAAAA0000A — 5 letters, 4 digits, 1 letter)

```python
def parse_pan(raw_text: str) -> dict:
    fields = {}

    # PAN number
    pan_match = re.search(r'\b([A-Z]{5}[0-9]{4}[A-Z])\b', raw_text)
    if pan_match:
        fields['pan_number'] = pan_match.group(1)

    # DOB
    dob_match = re.search(r'\b(\d{2}/\d{2}/\d{4})\b', raw_text)
    if dob_match:
        fields['dob'] = dob_match.group(1)

    # Name and Father's name — positional (above/below specific labels)
    lines = [l.strip() for l in raw_text.split('\n') if l.strip()]
    for i, line in enumerate(lines):
        if 'income tax department' in line.lower() or 'permanent account number' in line.lower():
            continue
        # Name usually appears as an ALL CAPS line
        if re.match(r'^[A-Z\s]{3,}$', line) and 'name' not in line.lower():
            if 'name' not in fields:
                fields['name'] = line
            elif 'fathers_name' not in fields:
                fields['fathers_name'] = line

    return fields
```

### 7.3 Field Normalization
After extraction, normalize all fields before comparison:
- Names → uppercase, strip extra whitespace, remove punctuation
- Dates → normalize to `DD/MM/YYYY` format consistently
- Gender → capitalize first letter only

---

## 8. Verification Engine

### 8.1 Responsibility
Compare extracted document fields against the customer's registered data in RDS. Write a field-level comparison result for every field checked.

### 8.2 Comparison Logic
```python
def run_verification(customer: dict, extracted: dict, document_type: str) -> dict:
    results = []
    all_match = True

    fields_to_compare = get_fields_for_document_type(document_type)

    for field in fields_to_compare:
        customer_value = normalize(customer.get(field))
        document_value = normalize(extracted.get(field))

        match = (customer_value == document_value)
        if not match:
            all_match = False

        results.append({
            'field_name': field,
            'customer_value': customer_value,
            'document_value': document_value,
            'is_match': match
        })

    overall_status = 'AUTO_VERIFIED' if all_match else 'REVIEW_REQUIRED'

    return {
        'field_comparisons': results,
        'overall_status': overall_status,
        'match_percentage': calculate_match_percentage(results)
    }
```

### 8.3 Fields Compared per Document Type
**Aadhaar:**
- name
- date_of_birth
- gender
- address (optional — lower weight, harder to OCR reliably)

**PAN:**
- name
- date_of_birth
- (PAN number stored but not compared against customer data — it's the document identifier)

---

## 9. SNS + SES Notifications

### 9.1 SNS (SMS)
- Create one SNS topic: `pramana-customer-notifications`
- The OCR Worker Lambda publishes to this topic after a decision
- SNS delivers SMS to the customer's registered phone number

**Message templates:**

Auto-verified:
```
Your KYC verification for Pramāṇa has been successfully completed. Welcome!
```

Approved by reviewer:
```
Your KYC verification for Pramāṇa has been approved. Welcome!
```

Rejected:
```
Your KYC verification could not be completed. Please log in to the Pramāṇa portal for more information.
```

Re-upload requested:
```
Your KYC document submission requires a re-upload. Please log in to the Pramāṇa portal to resubmit your document.
```

### 9.2 SES (Email)
- Verify the Pramāṇa sender email address in SES
- Start in SES sandbox (suitable for demo — send to verified addresses only)
- Email templates stored in SES or rendered in Lambda before sending
- Email contains more detail than SMS (portal link, next steps)

---

## 10. Security Configuration

### 10.1 Network Security — VPC
- RDS runs in a **private subnet** — no public internet access
- Lambda OCR Worker runs **inside the VPC** to access RDS
- Backend Lambda also runs inside the VPC
- Security group: Lambda SG → RDS SG on port 5432 only
- No inbound rules from the internet to RDS

### 10.2 S3 Security
- Document bucket: **Block all public access** enabled
- No bucket ACLs — use bucket policies only
- Bucket policy: explicit deny for any principal that is not the backend Lambda or OCR Worker Lambda
- Server-side encryption: SSE-S3 on all objects
- Access logging enabled on document bucket → separate S3 log bucket

### 10.3 API Gateway Security
- All API routes protected by **Cognito JWT authorizer**
- No unauthenticated routes except `/auth/register` and `/auth/login`
- Throttling enabled: 100 requests/second burst, 50 requests/second steady (free tier protection)
- CORS configured to allow only the CloudFront domain

### 10.4 Cognito Security
- Two separate User Pools: `pramana-customers` and `pramana-reviewers`
- Password policy: minimum 8 chars, uppercase, number, special character
- MFA: optional for customers, recommended for reviewers
- Reviewers are created manually by you — no self-registration for reviewer accounts
- Cognito tokens expire after 1 hour (access token), 30 days (refresh token)

### 10.5 Lambda Security
- Each Lambda function has its own IAM execution role
- Roles follow least privilege — OCR Worker can only access its specific S3 bucket, SQS queue, RDS, SNS
- No Lambda function has `*` permissions on any service
- Environment variables with sensitive values (DB connection string, SNS topic ARN) stored in Secrets Manager or Lambda environment (encrypted at rest by KMS)

### 10.6 RDS Security
- Master password stored in **Secrets Manager** — rotated manually for demo
- RDS not publicly accessible (`PubliclyAccessible: false`)
- Automated backups enabled (7-day retention — within free tier)
- Deletion protection enabled (prevents accidental deletion)

### 10.7 CloudTrail (Optional but Recommended)
Enable AWS CloudTrail to log all API calls to AWS services. This provides an audit of who did what in the AWS account — important for a KYC project that emphasizes auditability.

---

## 11. CloudWatch Monitoring

### 11.1 Log Groups
- `/aws/lambda/pramana-backend` — FastAPI backend logs
- `/aws/lambda/pramana-ocr-worker` — OCR pipeline logs
- `/aws/rds/pramana-db` — RDS logs (error + slow query)

### 11.2 Metric Filters and Alarms
| Alarm | Condition | Action |
|---|---|---|
| OCR DLQ depth | DLQ messages > 0 | Email alert to team |
| Lambda errors | Error count > 5 in 5 min | Email alert |
| RDS CPU | CPU > 80% for 5 min | Email alert |
| API Gateway 5xx | 5xx errors > 10 in 5 min | Email alert |

### 11.3 Dashboard
Create a CloudWatch dashboard showing:
- OCR pipeline throughput (documents processed/hour)
- Lambda invocation counts and error rates
- RDS connections and CPU
- SQS queue depth

---

## 12. Interfaces with Person B and Person C

### 12.1 What You Provide to Person B
These values must be shared securely (not via git — use a shared secure note or AWS Secrets Manager):
- RDS endpoint, port, database name
- Cognito User Pool IDs (customer + reviewer)
- Cognito App Client IDs
- S3 document bucket name and ARN
- SQS queue URL
- SNS topic ARN
- Lambda Layer ARN (Tesseract + OpenCV)
- AWS region

### 12.2 What Person B Provides to You
- SQS message schema (so your OCR Worker knows what to expect)
- RDS schema migrations (Person B writes the schema, you run them or confirm the RDS instance is accessible)
- The field names used in the DB (so your Verification Engine writes results in the correct columns)

### 12.3 What You Provide to Person C
- CloudFront domain (for frontend deployment)
- API Gateway base URL
- Cognito User Pool ID and App Client ID (for Amplify/Auth SDK config)
- S3 frontend bucket name (for deployment)

### 12.4 Critical Contract: Presigned URL Upload Flow
The document upload flow crosses all three people:
1. Person C (frontend) requests a presigned upload URL from the API
2. Person B (backend) generates the presigned URL using the S3 bucket you provisioned
3. Person C uploads directly to S3 using the presigned URL
4. S3 triggers SQS (you configure this S3 event notification)
5. Your OCR Worker picks up the SQS message and processes the document

This flow must be agreed and tested end-to-end.

---

## 13. Build Order for Person A

1. **AWS account setup** — MFA, admin IAM user, team IAM users
2. **Tesseract + OpenCV Lambda Layer POC** — prove it works before anything else
3. **SAM template skeleton** — provision S3, SQS, RDS, Cognito, API Gateway stubs
4. **VPC + security groups** — RDS in private subnet
5. **RDS instance** — PostgreSQL t3.micro, confirm Person B can connect
6. **S3 buckets** — document bucket + frontend bucket with correct policies
7. **SQS queues** — OCR queue + DLQ
8. **Cognito user pools** — customer + reviewer pools, app clients
9. **OCR Worker Lambda** — full implementation with OpenCV + Tesseract + parser + verification engine
10. **SNS + SES** — notification topics, email verification
11. **CloudWatch** — log groups, alarms, dashboard
12. **API Gateway** — HTTP API, Cognito authorizer, routes (connect to Person B's Lambda)
13. **CloudFront** — distribution for frontend bucket
14. **Final deployment** — `sam deploy` full stack
15. **IAM review** — audit all policies before demo

---

## 14. Key Technical Risks

| Risk | Mitigation |
|---|---|
| Tesseract fails to run on Lambda | POC first — if it fails, fall back to Rekognition DetectText |
| OCR quality too low for Aadhaar | Use clean test images for demo; re-upload flow handles failures |
| Lambda timeout for OCR | Set timeout to 5 minutes; optimize OpenCV preprocessing |
| RDS cold start latency | Use RDS Proxy or keep Lambda warm with scheduled pings |
| SES sandbox limitations | Verify all demo email addresses in SES sandbox before demo |
| SMS DLT registration (India) | Use SNS sandbox / CloudWatch log mode for SMS in demo |
