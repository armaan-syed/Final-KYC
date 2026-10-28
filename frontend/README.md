# Pramāṇa Frontend (Person C)

Production-ready Next.js 14 App Router frontend for the Pramāṇa Automated KYC Platform. Includes separate Customer and Reviewer portals, AWS Amplify/Cognito authentication, direct S3 presigned document uploads, OCR comparison views, reviewer decision forms, and mock adapters.

---

## 1. Features Implemented

### Architecture & Design System
- **Next.js 14 App Router + React 18 + TypeScript + Tailwind CSS**
- Consistent banking aesthetic: Deep Navy (`#0b2545`), clean white surfaces, subtle borders, accessible contrast.
- Static export compatible (`output: 'export'`) for S3 + CloudFront hosting.
- Query-parameter based routing for case details (`/reviewer/cases/detail/?caseId=...`) to ensure full CDN compatibility.

### Authentication
- Dual Customer and Reviewer sign-in support.
- Email verification / confirmation page (`/confirm?email=...`) matching Cognito OTP flow.
- Reviewer self-registration disabled.
- Route protection checking role and active session.

### Customer Portal
- **Dashboard (`/dashboard`)**: Welcome banner, active Case ID, current KYC status badge, registered profile details, and automatic polling during `PROCESSING` state every 10 seconds.
- **Upload (`/kyc/upload`)**: Select document type (Aadhaar / PAN), upload file (JPEG, PNG, PDF), preview, direct-to-S3 PUT upload with real-time progress bar, and completion submission.
- **Status & History (`/kyc/status`)**: Latest attempt details, field mismatch highlights, and reviewer rejection reasons.

### Reviewer Portal
- **Dashboard (`/reviewer/dashboard`)**: KPI statistics (Pending Reviews, Auto Verified Today, Approved Today, Rejected Today) with 60-second polling.
- **Review Queue (`/reviewer/queue`)**: Paginated list of flagged cases, mismatch badges, search by name/case, and document type filters.
- **Case Detail (`/reviewer/cases/detail`)**: Side-by-side comparison between customer database records and OCR extracted fields, short-lived S3 document preview, reviewer notes, decision actions (`Approve`, `Reject`, `Request Re-upload`), and full audit history.

---

## 2. Mock vs Real Integrations

The frontend includes mock adapters so that the UI can be run and tested without active AWS credentials:
- **Toggle**: Controlled via `NEXT_PUBLIC_USE_MOCKS=true` in `frontend/.env.local` or `.env.example`.
- **When `NEXT_PUBLIC_USE_MOCKS=false`**:
  - `src/lib/auth.ts` uses Amplify Cognito for customer/reviewer sign-in, access-token sessions, refresh, and sign-out.
  - `src/lib/api.ts` uses FastAPI for customer registration/confirmation and protected `/customer`, `/kyc`, and `/reviewer` calls.
  - S3 upload directly PUTs the document to the presigned S3 URL.

---

## 3. Step-by-Step Integration with Person B (FastAPI) and Person A (AWS Infra)

| Feature | Mock in Code | Real Endpoint (Person B) / Resource (Person A) | Request / Payload |
|---|---|---|---|
| Customer Registration | `apiRegister` in `api.ts` | `POST /auth/register` | `{ full_name, date_of_birth, gender, phone_number, email, password, address_line1, address_line2?, city, state, pincode }` |
| Email Confirmation | `apiConfirm` in `api.ts` | `POST /auth/confirm` | `{ email, confirmation_code }` |
| Login (Customer/Reviewer) | `loginUser` in `auth.ts` | Amplify Cognito SRP (no backend login route) | `{ email, password }`; role selects the configured pool/client |
| Customer Profile | `apiGetProfile` in `api.ts` | `GET /customer/profile` | Bearer token |
| KYC Status | `apiGetKYCStatus` in `api.ts` | `GET /customer/kyc/status` | Bearer token |
| Presigned Upload URL | `apiGetUploadUrl` in `api.ts` | `POST /kyc/upload-url` | `{ document_type, file_name, content_type }` |
| Direct S3 Upload | `directUploadToS3` in `api.ts` | S3 Presigned URL (Person A bucket) | HTTP PUT with `Content-Type` header |
| Submit KYC Case | `apiSubmitKYC` in `api.ts` | `POST /kyc/submit` | `{ s3_key, document_type, file_name, file_size_bytes }` |
| Reviewer Dashboard | `apiGetReviewerDashboard` in `api.ts` | `GET /reviewer/dashboard` | Reviewer Bearer token |
| Review Queue | `apiGetReviewQueue` in `api.ts` | `GET /reviewer/queue` | Reviewer Bearer token |
| Case Detail | `apiGetCaseDetail` in `api.ts` | `GET /reviewer/cases/{case_id}` | Reviewer Bearer token |
| Submit Decision | `apiSubmitDecision` in `api.ts` | `POST /reviewer/cases/{case_id}/decide` | `{ decision: 'APPROVED' \| 'REJECTED' \| 'REUPLOAD_REQUESTED', notes }` |

The frontend sends Cognito **access tokens** on protected calls. FastAPI
validates the pool issuer, signature, expiry, `token_use`, and app-client ID;
the API Gateway REST API does not add another authorizer. The backend does not
issue or refresh tokens. The upload contract accepts JPEG/PNG/PDF up to 10 MiB
and a maximum of 3 PDF pages.

---

## 4. Local Execution & Safe Git Commands

### Running Locally
```bash
cd frontend
npm run dev
# Open http://localhost:3000 in your browser
```

### Static Build
```bash
cd frontend
npm run build
# Generates the static export in frontend/out/ ready for S3 sync
```

### Git Commit & Push
```bash
git add frontend/
git commit -m "feat(frontend): implement Person C customer and reviewer portals with Next.js 14 and Amplify auth"
git push origin master
```
