# Pramāṇa — Automated KYC Document Verification System

## Project Overview

**Pramāṇa** is a cloud-hosted KYC (Know Your Customer) document verification system designed specifically around a **banking-style customer onboarding and verification workflow**.

The system allows a new customer to register with their personal information, securely upload a KYC document such as an **Aadhaar Card or PAN Card**, and have the information extracted from the document automatically compared against the customer's registered information.

The core principle is:

> **Automate straightforward 100% matches and send exceptions to a human reviewer.**

The goal is to build a realistic, production-oriented mini project rather than simply demonstrating OCR or AWS services.

---

## 1. Customer Registration

A customer first accesses the Pramāṇa website.

They can either:

- **Create a new account**
- **Sign in to an existing account**

During registration, the customer provides the information required for the company's KYC/customer records, such as:

- Full name
- Date of birth
- Address
- Phone number
- Email address
- Gender
- Other required customer information

This information is stored securely in the application's database and becomes the **reference data** for subsequent KYC verification.

---

## 2. Customer Login

Existing customers can log in to their account and access their KYC verification section.

The customer can view their verification status and submit a KYC document when verification is required.

---

## 3. KYC Document Upload

The customer selects the type of KYC document they want to submit:

- **Aadhaar Card**
- **PAN Card**

The document is uploaded securely to the system.

A KYC verification request is created and associated with the customer's account.

The uploaded document is then passed to the document-processing pipeline.

---

## 4. Automated Document Processing

Pramāṇa processes the uploaded document and extracts the relevant information.

The system performs:

1. Document identification
2. Document processing/OCR
3. Data extraction
4. Field normalization
5. Validation of extracted information
6. Comparison against the customer's stored information

The system uses document-specific extraction rules because Aadhaar and PAN documents contain different information and have different verification requirements.

---

## 5. Field-Level Verification

The extracted document information is compared against the customer's registered information.

For example:

| Field | Customer Database | Document | Result |
|---|---|---|---|
| Name | ARMAAN SYED | ARMAAN SYED | ✅ Match |
| Date of Birth | 15/02/2007 | 15/02/2007 | ✅ Match |
| Address | Mumbai | Mumbai | ✅ Match |
| Gender | Male | Male | ✅ Match |

The system performs **field-level matching** rather than simply producing a generic verification result.

---

## 6. Automatic Verification

If all required fields match successfully and the verification reaches a **100% match**, Pramāṇa automatically verifies the KYC request.

The system:

- Updates the customer's KYC status
- Records the verification result
- Records the verification timestamp
- Stores the verification information for future reference
- Sends an SMS notification to the customer confirming that their KYC has been successfully verified

### Example

**100% Match → Automatically Verified → SMS Sent to Customer**

This removes unnecessary manual work for straightforward cases.

---

## 7. Manual Review for Mismatches

If the document does **not** achieve a 100% match, the system does not automatically reject the customer.

Instead, the request is placed into a **Manual Review Queue**.

This is the human-in-the-loop component of Pramāṇa.

The reviewer can see exactly which fields caused the mismatch.

For example:

| Field | Customer Database | Document | Result |
|---|---|---|---|
| Name | ARMAAN SYED | ARMAAN SYED | ✅ |
| Date of Birth | 15/02/2007 | 15/02/2006 | ❌ |
| Address | Mumbai | Mumbai | ✅ |
| Gender | Male | Male | ✅ |

The reviewer therefore does not have to manually compare the entire document from scratch.

---

## 8. Reviewer Dashboard

An authorized bank/company reviewer can log into the Pramāṇa reviewer portal.

The dashboard provides:

- Pending KYC requests
- Automatically verified requests
- Rejected requests
- Requests requiring manual review
- Customer information
- Uploaded document
- Extracted document information
- Field-by-field comparison
- Exact mismatches
- Verification status
- Audit history

The reviewer can open a KYC request and inspect the complete verification summary.

---

## 9. Exact Verification Mapping

For every manually reviewed request, Pramāṇa displays an exact mapping between the customer's registered information and the information extracted from the document.

Example:

```text
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

The reviewer can immediately identify the reason why automatic verification failed.

---

## 10. Reviewer Decision

The reviewer has final authority over cases that require manual intervention.

The reviewer can:

- **Approve**
- **Reject**
- **Request Re-upload**

A re-upload option is useful when the document is unclear, blurry, damaged, or the extraction result appears unreliable.

For a genuine mismatch, the reviewer can reject the KYC request.

---

## 11. Audit Trail

All important manual actions are recorded in an audit trail.

For example:

```text
KYC ID:          KYC-1042
Reviewer:        reviewer_17
Decision:        REJECTED

Field:           Date of Birth

Registered Value: 15/02/2007
Document Value:  15/02/2006

Reason:
Date of birth mismatch

Timestamp:
28-Oct-2026 10:42:31 IST
```

The audit trail provides accountability and allows the organization to understand **who performed an action, what was changed/decided, why it happened, and when it happened**.

---

# Complete System Workflow

```text
                         CUSTOMER
                            │
                            ▼
                    ┌───────────────┐
                    │ Register/Login │
                    └───────┬───────┘
                            │
                            ▼
                    Customer Information
                            │
                            ▼
                       Customer DB
                            │
                            │
                    ┌───────▼────────┐
                    │ Upload KYC Doc │
                    └───────┬────────┘
                            │
                       PAN / Aadhaar
                            │
                            ▼
                    Secure Document Storage
                            │
                            ▼
                    Document Processing
                            │
                            ▼
                       OCR / Extraction
                            │
                            ▼
                    Data Normalization
                            │
                            ▼
                    Field-Level Matching
                            │
                  ┌─────────┴─────────┐
                  │                   │
             100% Match           < 100%
                  │                   │
                  ▼                   ▼
           AUTO VERIFIED        MANUAL REVIEW
                  │                   │
                  │             Reviewer Dashboard
                  │                   │
                  │            Exact Field Mapping
                  │                   │
                  │          ┌────────┼────────┐
                  │          │        │        │
                  │       APPROVE   REJECT  RE-UPLOAD
                  │          │        │        │
                  └──────────┴────────┴────────┘
                             │
                             ▼
                       Final KYC Status
                             │
                             ▼
                        Audit Trail
                             │
                             ▼
                     Customer Notification
```

---

# Project Goal

The final Pramāṇa system should be a **fully functional, cloud-hosted and deployed application**, not merely an AWS configuration demonstration.

The project should demonstrate:

- Real customer onboarding
- Secure authentication
- Database-backed customer records
- KYC document upload
- Document processing and information extraction
- Automated field-level verification
- 100% automatic verification
- Human-in-the-loop exception handling
- Reviewer dashboard
- Exact mismatch mapping
- KYC decision management
- Audit logging
- Customer notifications
- Secure cloud infrastructure
- Monitoring and operational visibility
- Production-oriented deployment

The final deployed application should be accessible and demonstrable as a **resume- and LinkedIn-worthy software engineering project**.

## Core Design Philosophy

**Pramāṇa is not intended to replace human KYC reviewers.**

Instead:

> **Pramāṇa automates routine KYC verification and directs exceptions to authorized human reviewers.**

This creates a practical banking-oriented workflow where automation reduces manual workload while human reviewers retain control over non-matching or ambiguous cases.