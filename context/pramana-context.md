# Pramāṇa — Project Context Document

> This document is the single source of truth for all ideation, design decisions, and architecture decisions made for the Pramāṇa KYC Verification System. It should be updated as new decisions are made.

> **Implementation status:** this is the original product/architecture brief.
> The active frontend on `master` is React 18 + TypeScript + Vite (not the
> Next.js framework described in the initial proposal). Current integration,
> deployment, and owner status is tracked in
> [`implementation/FINAL_PROJECT_INTEGRATION.md`](../implementation/FINAL_PROJECT_INTEGRATION.md).

---

## 1. Project Overview

**Pramāṇa** is a cloud-hosted, AWS-native KYC (Know Your Customer) document verification system modelled around a banking-style customer onboarding workflow.

The system allows a customer to register, upload a KYC document (Aadhaar or PAN card), and have the information extracted from the document automatically compared against their registered profile.

**Core principle:**
> Automate straightforward 100% matches. Send exceptions to a human reviewer.

**Project goal:** A fully functional, cloud-deployed portfolio project — demonstrable and LinkedIn/resume worthy.

---

## 2. System Workflow

### 2.1 Customer Registration
The customer creates an account on the Pramāṇa web portal and provides:
- Full name
- Date of birth
- Address
- Phone number
- Email address
- Gender
- Other required KYC information

This information is stored in the database and becomes the **reference data** for KYC verification.

### 2.2 Customer Login
Existing customers log in and access their KYC verification section. They can view their verification status and submit a document.

### 2.3 KYC Document Upload
The customer selects a document type:
- **Aadhaar Card**
- **PAN Card**

The document is uploaded securely. A KYC verification request is created and the document enters the processing pipeline.

### 2.4 Automated Document Processing
The pipeline performs:
1. Document image preprocessing (OpenCV)
2. OCR / text extraction (Tesseract)
3. Document-specific parsing (Aadhaar rules / PAN rules)
4. Field normalization
5. Field-level comparison against the customer's registered data

### 2.5 Field-Level Verification
Extracted fields are compared against the customer's registered information at the field level.

| Field | Customer DB | Document | Result |
|---|---|---|---|
| Name | ARMAAN SYED | ARMAAN SYED | ✅ Match |
| Date of Birth | 15/02/2007 | 15/02/2007 | ✅ Match |
| Address | Mumbai | Mumbai | ✅ Match |
| Gender | Male | Male | ✅ Match |

### 2.6 Automatic Verification (100% Match)
If all required fields match, the system automatically verifies the KYC request:
- Updates KYC status to AUTO_VERIFIED
- Records verification timestamp
- Sends SMS notification via SNS
- Sends email notification via SES

### 2.7 Manual Review Queue (< 100% Match)
If any field mismatches, the request is placed in the Manual Review Queue. The system does **not** automatically reject the customer.

The reviewer sees exactly which fields caused the mismatch.

### 2.8 Reviewer Dashboard
An authorized reviewer logs into the Pramāṇa reviewer portal and sees:
- Pending KYC requests with badge count
- Requests requiring manual review (with mismatch summary)
- Auto-verified requests
- Rejected requests
- Full field-by-field comparison for each case
- Customer information and uploaded document
- Audit history

### 2.9 Reviewer Decision
The reviewer has final authority over mismatched cases and can:
- **Approve** — override and verify the customer
- **Reject** — reject the KYC request
- **Request Re-upload** — document is unreadable or extraction appears unreliable

### 2.10 Audit Trail
All manual reviewer actions are recorded:

```
KYC ID:           KYC-1042
Reviewer:         reviewer_17
Decision:         REJECTED
Field:            Date of Birth
Registered Value: 15/02/2007
Document Value:   15/02/2006
Reason:           Date of birth mismatch
Timestamp:        28-Oct-2026 10:42:31 IST
```

---

## 3. Notifications

### 3.1 Customer Notifications

| Event | SMS (SNS) | Email (SES) |
|---|---|---|
| Document submitted | ✅ | ✅ |
| Auto-verified | ✅ | ✅ (with details) |
| Reviewer approved | ✅ | ✅ (with details) |
| Reviewer rejected | ✅ (generic) | ✅ (generic + portal link) |
| Re-upload requested | ✅ | ✅ |

**Rejection SMS (generic — no sensitive detail in SMS):**
```
Your KYC verification could not be completed.
Please log in to the Pramāṇa portal for more information.
```

**Rejection detail is portal-only:**
```
KYC Status: Rejected
Reason: Date of Birth mismatch
Registered: 15/02/2007
Document:   15/02/2006
```

### 3.2 Reviewer Notifications
- Dashboard badge showing pending review count
- Queue showing new cases and cases requiring review
- Optional email alert for high-volume situations (e.g., 20+ pending cases)
- No email per individual new case (avoids notification spam)

---

## 4. Data Model

### 4.1 Hierarchy
```
Customer
  └── KYC Case (one per customer, active)
        ├── Attempt 1
        │     ├── Document (S3 reference)
        │     ├── Extracted Fields
        │     ├── Field Comparisons
        │     └── Decision
        ├── Attempt 2
        │     ├── Document
        │     ├── Extracted Fields
        │     ├── Field Comparisons
        │     └── Decision
        └── Current Status (derived from latest attempt)
```

### 4.2 Re-upload Flow
When a reviewer requests a re-upload, a **new attempt is created** on the existing KYC Case. The original attempt is **never deleted or modified**. This preserves full history for audit purposes.

```
KYC Case
  ├── Attempt 1 → Status: REUPLOAD_REQUESTED
  └── Attempt 2 → Status: PROCESSING / AUTO_VERIFIED / etc.
```

### 4.3 KYC Case Status Values
| Status | Description |
|---|---|
| PENDING | Customer has not submitted a document yet |
| PROCESSING | Attempt is currently in the OCR pipeline |
| AUTO_VERIFIED | System verified — 100% field match |
| APPROVED | Reviewer manually approved |
| REJECTED | Reviewer rejected |
| REUPLOAD_PENDING | Reviewer requested re-upload, awaiting customer |

### 4.4 Document Types per Attempt
Each attempt carries which document type was submitted (Aadhaar or PAN). Extraction rules and field comparison logic differ by document type.

---

## 5. Architecture

### 5.1 Architecture Diagram

```
CUSTOMER
    │
    ▼
React / Next.js Web App
    │
    ▼
CloudFront + S3 (Frontend Hosting)
    │
    ▼
API Gateway
    │
    ▼
FastAPI + Mangum (Lambda)
    │
    ├── Cognito (Auth)
    ├── S3 (Document Storage) ──→ SQS ──→ Lambda OCR Worker
    │                                           │
    │                                    OpenCV (preprocessing)
    │                                           │
    │                                    Tesseract OCR (Lambda Layer)
    │                                           │
    │                                    Document Parser
    │                                    (Aadhaar / PAN rules)
    │                                           │
    │                                    Verification Engine
    │                                           │
    │                                  ┌────────┴────────┐
    │                                  │                 │
    │                               100%              <100%
    │                                  │                 │
    │                            Auto Verify       Review Queue
    │                                  │                 │
    │                                  │          Reviewer Portal
    │                                  │          Approve/Reject/Re-upload
    │                                  │                 │
    └──────────────────────────────────┴─────────────────┘
                                       │
                                       ▼
                                  PostgreSQL / RDS
                                       │
                              ┌────────┴────────┐
                              ▼                 ▼
                             SNS               SES
                            (SMS)            (Email)

                          CloudWatch
                    Logs + Metrics + Alarms
```

### 5.2 Technology Decisions

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React / Next.js | Customer portal + Reviewer portal |
| Frontend Hosting | CloudFront + S3 | Static site hosting |
| API | FastAPI + Mangum | Runs on Lambda via ASGI adapter |
| Auth | Amazon Cognito | Separate user pools for customers and reviewers |
| Document Storage | Amazon S3 | Secure, private bucket |
| Queue | Amazon SQS | Decouples upload from OCR processing |
| OCR Worker | AWS Lambda | Tesseract + OpenCV via Lambda Layer |
| OCR Engine | Tesseract OSS | Packaged as Lambda Layer |
| Image Preprocessing | OpenCV | Packaged as Lambda Layer |
| Database | PostgreSQL on RDS | t3.micro, free tier (12 months) |
| SMS Notifications | Amazon SNS | |
| Email Notifications | Amazon SES | |
| Monitoring | CloudWatch | Logs, metrics, alarms |

### 5.3 AWS Free Tier Constraints
All services are chosen to operate within the AWS free tier:

| Service | Free Tier |
|---|---|
| Lambda | 1M requests, 400K GB-seconds/month |
| API Gateway | 1M API calls/month (12 months) |
| S3 | 5GB storage, 20K GET, 2K PUT/month |
| SQS | 1M requests/month |
| RDS | 750hrs t3.micro, 20GB storage (12 months) |
| Cognito | 50,000 MAUs (always free) |
| SNS | 1M publishes, 100 SMS/month |
| SES | 62,000 emails/month (when sent from Lambda) |
| CloudWatch | 10 custom metrics, 5GB logs (12 months) |
| CloudFront | 1TB data transfer, 10M requests/month (12 months) |

Tesseract runs inside Lambda — no additional service cost.

---

## 6. OCR Pipeline Detail

### 6.1 Why Tesseract on Lambda
- Free forever (open source, runs inside Lambda)
- No external API dependency
- AWS-native execution environment
- Demonstrates deeper engineering (custom OCR pipeline)
- Lambda Layer packaging is well-documented and production-proven

### 6.2 Pipeline Steps
1. Customer uploads document → stored in S3
2. S3 event triggers SQS message
3. Lambda OCR Worker picks up SQS message
4. Lambda downloads image from S3
5. OpenCV preprocesses image (grayscale, denoising, thresholding)
6. Tesseract extracts raw text
7. Document Parser applies Aadhaar or PAN specific rules (regex + positional logic)
8. Structured fields extracted: Name, DOB, Address, Gender, ID Number
9. Verification Engine compares fields against customer's RDS record
10. Result written to RDS
11. If 100% match → Auto Verify → SNS + SES notification
12. If mismatch → status set to REVIEW_REQUIRED → appears in reviewer queue

### 6.3 Tesseract Feasibility
- **Clean scans / good photos:** Works reliably ✅
- **Blurry / angled phone photos:** May fail — handled by Re-upload flow ✅
- Lambda package size: Tesseract + eng + hin language packs ≈ 50–100MB — within Lambda Layer limits ✅
- POC must be validated before full build

### 6.4 POC Validation Checklist (Do Before Full Build)
- [ ] Package Tesseract + OpenCV as Lambda Layer
- [ ] Verify layer size within 250MB unzipped limit
- [ ] Run OCR on a sample Aadhaar image
- [ ] Run OCR on a sample PAN image
- [ ] Measure Lambda execution time (must be within timeout)
- [ ] Validate parser can extract Name, DOB, Gender from raw Tesseract output

---

## 7. Reviewer Portal

### 7.1 Dashboard Layout
```
┌─────────────────────────────┐
│ 🔔 7 Pending Reviews        │
└─────────────────────────────┘

NEW CASES
───────────────────────────────
KYC-1048   Submitted 10:30am
KYC-1047   Submitted 09:15am

REVIEW REQUIRED
───────────────────────────────
KYC-1043   DOB mismatch
KYC-1042   Address mismatch
```

### 7.2 Case Detail View
For each case the reviewer sees:
- Customer registered information
- Uploaded document image
- Extracted document fields
- Field-by-field comparison with match/mismatch indicators
- Attempt history (Attempt 1, Attempt 2, etc.)
- Audit trail for this case
- Action buttons: Approve / Reject / Request Re-upload

### 7.3 Exact Mismatch Mapping
```
CUSTOMER INFORMATION        DOCUMENT INFORMATION

Name
ARMAAN SYED              →   ARMAAN SYED          ✓

Date of Birth
15/02/2007               →   15/02/2006           ✗

Address
Mumbai, Maharashtra      →   Mumbai, Maharashtra  ✓

Gender
Male                     →   Male                 ✓
```

---

## 8. Immediate Next Steps

1. **Tesseract + OpenCV Lambda POC** — validate before any full system build
2. **Database schema** — full PostgreSQL schema for Customer → KYC Case → Attempt → Document → Extracted Fields → Comparisons → Decision → Audit Events
3. **API design** — all endpoints for customer portal, OCR pipeline callbacks, and reviewer portal
4. **Build order:**
   - Auth + customer registration (Cognito + RDS)
   - Document upload (S3)
   - OCR pipeline (SQS + Lambda + Tesseract)
   - Verification engine
   - Customer portal (React/Next.js)
   - Reviewer portal
   - Notifications (SNS + SES)
   - CloudWatch monitoring
   - Deployment (CDK or SAM)

---

## 9. Design Principles

- **Automate routine, escalate exceptions** — not replacing human reviewers, reducing their workload
- **Immutable audit history** — nothing is deleted, every action is recorded
- **Attempt-based re-upload** — old attempts preserved permanently
- **Generic SMS for rejections** — sensitive detail in portal only
- **Free tier first** — every service choice validated against AWS free tier
- **POC before build** — validate the only real technical risk (Tesseract on Lambda) before committing to full build
