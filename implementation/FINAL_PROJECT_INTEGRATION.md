# Pramāṇa — Final Project Integration Plan

Use this after and during the individual Person A, B, and C plans. It coordinates their existing assignments and defines project-wide verification; it does not reassign work or add product scope.

## Final Project Integration

## Current integration snapshot — 2026-10-30

This status supersedes the earlier snapshot below.

- AWS caller: non-root `pramana-admin` in account `682197558335`, `us-east-1`. `pramana-dev-backend` is `UPDATE_COMPLETE` at `https://rimait7lg7.execute-api.us-east-1.amazonaws.com/dev`; `pramana-dev-foundation` is `UPDATE_COMPLETE`. No NAT or interface endpoints were added.
- RDS is private and migrated at `001_initial_schema`; the catalog check found all nine expected application tables, 67 expected columns, and `customers.date_of_birth` as `DATE NOT NULL`.
- The deployed API `/health` returns 200. Reviewer CORS preflight from `https://d231rykprgnarh.cloudfront.net` returns 200, and unauthenticated reviewer API access returns 403. A live synthetic API workflow passed: Cognito customer/reviewer access tokens → upload URL → presigned S3 PUT → submit/SQS → OCR worker → `REVIEW_REQUIRED` → reviewer queue/detail → `REUPLOAD_REQUESTED` → customer `REUPLOAD_PENDING` and audit. It used a blank synthetic Aadhaar PNG and `.invalid` identities; no real customer data or deliverable notification was used. SES logged `provider_accepted=false` for the synthetic re-upload email. That workflow's test rows and temporary artifacts were removed.
- OCR worker is Active with SQS event mapping Enabled, runtime Python 3.12, OCR layer v4, and shared layer v7. Its actual queued document completed successfully to `REVIEW_REQUIRED`; the reviewed decision/status/audit then persisted through the deployed API and RDS.
- Current-turn checks: backend auth/reviewer suite **15 passed** with existing deprecation warnings; frontend **15 passed**; production Vite build passed. `npm audit --omit=dev` reports **0 vulnerabilities**. The new Amplify first-login password-change flow is deployed; CloudFront distribution `EMNA2N11641KK` is `Deployed` at `https://d231rykprgnarh.cloudfront.net`, serves the latest JS bundle, and direct `/reviewer/dashboard` navigation returns the SPA shell. API CORS allows the CloudFront origin.
- The target Cognito reviewer account was absent, so Cognito created it and sent an administrator invitation with a generated temporary password. Its live state is `FORCE_CHANGE_PASSWORD`; the recipient must complete the new-password challenge. The database `reviewers` row is still missing, so this is not yet an authorized or working application reviewer login. A temporary one-shot DB function could not be uploaded from the workstation because AWS S3/Lambda ZIP uploads stalled/closed; its temporary role/log group were removed. No DB write was made.
- SES sender identity is verified, but SES production access remains disabled. SNS SMS attributes cannot be read because the account lacks the service subscription. Notification delivery is therefore not ready; no real email or SMS was delivered.
- Remaining release acceptance: complete the target reviewer’s active DB row through the approved private SQL path, have the recipient complete the Cognito invitation, and verify browser reviewer sign-in/dashboard/queue/decision/audit. Also run browser customer registration/confirmation and upload/status checks. SES production access and approved SNS SMS service/use/spending setup remain prerequisites before real notification delivery tests.

## Earlier integration snapshot — 2026-10-29

- The shared decisions and owner actions are recorded in `INTEGRATION_DECISIONS_2026-10-29.md`. B's latest `master` commit `cdfeedf` was fetched and fast-forwarded; A's reconciled changes are being validated before push.
- Combined local verification: backend **33 passed** (34 dependency deprecation warnings); OCR/worker **33 passed, 1 skipped** (dedicated migrated PostgreSQL test DB not configured); frontend **2 passed** and `npm run build` succeeded as a static export. The build emitted `/dashboard`, `/reviewer/dashboard`, `/reviewer/queue`, and `/reviewer/cases/detail`. `npm audit --omit=dev` reports **3 production dependency vulnerabilities** (2 high, 1 critical); fixing them requires a Next.js/Zod major upgrade according to the current lockfile audit and needs C's compatibility review.
- The Lambda-compatible OCR proof passed in Python 3.12 x86_64 for synthetic Aadhaar PNG, PAN PNG, and Aadhaar PDF. All auto-verified at 100%; combined function/layer size was 258,176,462 bytes of 262,144,000 bytes. Recheck package headroom before any dependency change.
- A's `pramana-dev-foundation` is deployed with no NAT or interface endpoints; OCR and CloudFront remain disabled. B's private RDS is `available`, encrypted, and not publicly accessible. Cognito pools/clients exist; customer attributes and current auth-flow configuration were live-inspected.
- A deployed the dual-stack private subnet route through egress-only gateway `eigw-0e03c52bb1008d130`. A reviewed change set and verified active subnet IPv6 routes plus TLS-only IPv6 Lambda egress. Temporary read-only Lambdas in the same private subnets successfully called Secrets Manager, SQS, SNS, Cognito, and SES APIs. The prior database connectivity probe stack is absent. The separate migration runner was deleted after its successful one-shot invocation; Lambda released both ENIs, then A removed the temporary role. No diagnostic runner resources remain.
- A reviewed the auth boundary: frontend uses Amplify SRP; registration/confirmation use FastAPI; protected calls carry Cognito access tokens validated by FastAPI for signature, issuer, expiry, token-use, and app-client ID. `/auth/login`, `/auth/refresh`, and `/auth/logout` are removed from backend source. This source-level review and A's network path resolve the A-owned blockers B reported, but do not prove the not-yet-deployed backend Lambda.
- A applied the Alembic migration to live RDS and verified revision `001_initial_schema`, all nine expected tables, and `customers.date_of_birth` as PostgreSQL `date`. SES sender `armaansyed009@gmail.com` is verified, but SES production access remains disabled; the SNS SMS service subscription/spend configuration is unresolved. No B-owned backend API change set was shared for review, and the API/Lambda is not deployed. Keep the OCR worker disabled until its reviewed deployment and notification prerequisites are ready. No deployed end-to-end workflow is claimed.

### Integration sequence

1. **Baseline and contract checkpoint:** shared queue, recovery, status, Cognito, notification, upload-limit, and static-routing decisions are recorded in `INTEGRATION_DECISIONS_2026-10-29.md`; owners implement that contract and report exceptions.
2. **Person A foundation:** complete the Tesseract/OpenCV POC and deploy foundational infrastructure outputs; keep database private and document bucket private.
3. **Person B data/API foundation:** create and test migration/models against a local PostgreSQL instance; share the API, status and queue schemas with A and C.
4. **A/B worker integration:** run the OCR worker against B's schema and fixtures; verify each status/write/decision/audit event.
5. **B/C API integration:** run FastAPI locally/SAM and frontend against it; verify auth, customer data isolation, response/error shapes and reviewer permissions.
6. **A/C hosting/auth integration:** deploy frontend to private S3/CloudFront, verify Cognito configuration, static routes, API CORS and browser token use.
7. **Full workflow:** test upload through S3, agreed queue trigger, OCR, RDS, polling, reviewer action, audit and notification against a test environment.
8. **Release review:** inspect Git diff, migration order, SAM change set, IAM scope, environment variables, secrets, logs, and all acceptance evidence before calling the project complete.

### Cross-person verification matrix

| Boundary | Verification |
|---|---|
| API contract | Compare OpenAPI output or agreed schemas to frontend types and examples. Test all customer and reviewer routes, success/error payloads, dates, pagination and status values. |
| Authentication | Verify public registration/confirmation, Amplify customer/reviewer SRP sessions, access-token expiry, FastAPI pool/client and role checks, and cross-role denial. API Gateway remains a proxy without a second authorizer. |
| Database | Apply B's migrations to a clean PostgreSQL database, then process an OCR message using A's worker. Confirm customer → case → attempts → documents → extraction/comparisons → decision/audit foreign keys and state consistency. |
| Document flow | Obtain a URL from B, upload directly from C to A's private bucket, submit metadata, and confirm exactly one message and matching S3 key/attempt ID reach A's worker. Verify rejected origins/content types/expired URLs fail safely. |
| OCR/verification | Test sanitized Aadhaar and PAN success/mismatch cases, normalization, required-field behavior, full-match decision, reviewer queue state, and no data leakage in logs. |
| Reviewer flow | Load queue/detail through C, view short-lived document URL, submit each allowed decision through B, confirm state/audit/notifications, and verify re-upload preserves the earlier attempt. |
| Notifications | Confirm notifications follow the defined transition ownership, generic rejection copy, destinations/sandbox behavior, and no sensitive values in SMS. Verify ordinary retry deduplication and document the unavoidable provider/database delivery ambiguity rather than claiming strict exactly-once delivery. |
| Deployment/config | Compare SAM outputs and Lambda settings with B/C env examples; verify frontend CORS origin, CloudFront routes, Lambda permissions, RDS private access, and absence of committed secrets. |
| Operations | Verify CloudWatch log groups, dashboard, DLQ alarm, Lambda error alarm, RDS CPU alarm and API 5xx alarm using safe test signals where practical. |

### Full-system test workflows

Run these against local services/mocks first, then against a deployed test stack using synthetic records and non-sensitive fixtures:

1. **New customer, successful Aadhaar:** register → confirm → sign in → get presigned URL → direct upload → submit → one queue job → OCR/parser → all required fields match → `AUTO_VERIFIED` → status appears in customer portal → one notification and system audit/decision are stored.
2. **New customer, successful PAN:** upload a PAN document whose name and DOB match → PAN identifier is stored but not compared → `AUTO_VERIFIED` → customer status and notification update.
3. **New customer, mismatch:** upload PAN or Aadhaar with one deliberate field mismatch → result enters the agreed review status → reviewer sees exact field values and mismatch → approve or reject → case/attempt/decision/audit update → customer status and allowed notification update.
4. **Unreadable document and re-upload:** OCR cannot produce reliable required fields → reviewer requests re-upload → original attempt remains unchanged and visible → customer submits a new attempt → processing and result update the current case.
5. **Authorization:** no token cannot access protected APIs; customer cannot access reviewer APIs or another customer's record; reviewer cannot use customer identity to access customer-only routes; invalid, expired, wrong-pool and wrong-role tokens are rejected.
6. **Failure behavior:** invalid file type/content type, expired presigned URL, S3 PUT error, backend submit failure, duplicate submit, malformed SQS payload, OCR/parser failure, DB unavailable, SQS retry/DLQ, notification provider error, expired preview URL, and API 4xx/5xx all produce recoverable and non-misleading behavior.
7. **Frontend deployment:** customer and reviewer routes work on the CloudFront domain after direct navigation/refresh; static assets load; CORS and authorization work; processing polling stops at the correct state.

### Failure-case testing

- Assert every unsuccessful upload or processing step leaves the case/attempt in an honest state; no success notification or UI state may be sent before its corresponding operation is committed.
- Assert SQS retries do not create duplicate extracted fields, comparisons, decisions, audit events, or routine notification attempts for a single logical attempt. Use the attempt identifier and transactional/idempotent persistence defined by the agreed schema. Document the crash window between external notification delivery and recording its result; do not claim strict exactly-once delivery.
- Assert reviewer decision failure does not partially update status without the corresponding decision/audit record.
- Assert external service failures are logged without secrets or document contents and are visible through the configured operational metrics/alarms.

### Regression testing

- Run each person's unit/API/component tests after changes to a shared schema or contract.
- Re-run migration tests from an empty database and against the current migration head.
- Re-run API contract tests after backend schema changes and frontend type/build checks after status changes.
- Re-run upload, OCR, reviewer, auth, and static-deployment end-to-end workflows after final infrastructure or environment changes.
- Inspect the final diff for unrelated edits and verify the documented source requirements remain represented.

### Final acceptance criteria

- The application starts locally using documented setup instructions and the deployed frontend/API are reachable in the intended test/demo environment.
- All context-defined customer, OCR, verification, reviewer, audit, notification, security, and monitoring behaviors are implemented and integrated.
- Every shared API, auth, database, queue, status, notification, and frontend configuration contract is written down and matches code on all sides.
- Automated tests cover unit, API, database, auth/authorization, frontend components, integrations, failure cases, and regression-prone contracts; end-to-end checks cover successful and failed workflows.
- RDS is not public; document storage is private; IAM is scoped; no credentials or real identity documents are committed or exposed in browser bundles/logs.
- No feature is marked complete based only on source code existing: relevant tests pass, integration evidence is recorded, and any unavailable AWS integration is labeled unverified with its blocker.

### Definition of “project complete”

Pramāṇa is complete when the implemented customer and reviewer portals, FastAPI API, Cognito authentication, PostgreSQL data model, presigned private upload, OCR/verification pipeline, reviewer decisions/re-upload history, audit trail, SNS/SES notifications, CloudFront/S3 deployment, and CloudWatch operations all work together through the workflows above; the contract and acceptance checks pass; and each person has handed off runnable instructions and verification evidence.
