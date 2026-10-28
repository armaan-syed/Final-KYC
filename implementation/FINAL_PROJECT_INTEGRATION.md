# Pramāṇa — Final Project Integration Plan

Use this after and during the individual Person A, B, and C plans. It coordinates their existing assignments and defines project-wide verification; it does not reassign work or add product scope.

## Final Project Integration

## Current integration snapshot — 2026-10-29

- The A/B queue, status, key, notification, and persistence interfaces have a locally tested baseline recorded in `PERSON_A_B_WORK_SPLIT.md`. Direct-phone SMS through the shared notification module is the selected behavior; DB/SQS and DLQ recovery paths still need the team's final operational decision.
- Current local test run: backend suite **19 passed**; OCR/worker suite **28 passed, 1 skipped** (the optional PostgreSQL integration test has no dedicated test URL in this run). Person B's database and backend templates both pass AWS CloudFormation `validate-template`; a local `cfn-lint`/`cfn-guard` run was not available in this execution.
- The updated layer and actual worker proof passed inside the Python 3.12 x86_64 Lambda image for synthetic Aadhaar PNG, PAN PNG, and Aadhaar PDF. All auto-verified at 100%; measured combined function/layer size is 258,176,462 bytes of the 262,144,000-byte quota, leaving about 3.8 MiB headroom. The 93,834,078-byte layer ZIP must be staged through S3.
- Person A's `pramana-dev-foundation` stack is deployed with no NAT, no interface endpoints, OCR disabled, and CloudFront disabled. Person B's private PostgreSQL stack `pramana-dev-database` is deployed and verified; it is encrypted, non-public, and uses the account-compatible one-day backup retention. Cognito pools/clients exist and their configuration/output handoff is in `backend/COGNITO_OUTPUTS.md`.
- The RDS migration and backend API are not deployed. The private Lambdas need Person A's approved interface endpoints for Secrets Manager, SQS, SNS, SES, and Cognito; the SES sender identity is also pending a verified sender address/domain. No end-to-end workflow is claimed. See `backend/IMPLEMENTATION_HANDOFF.md` for current blockers and `PERSON_A_IMPLEMENTATION_PLAN.md` for network endpoint options/costs.


### Integration sequence

1. **Baseline and contract checkpoint:** all three agents inspect the same branch, review the context docs, record current code/test state, and resolve the shared contract table in the individual plans, including attempt-ID allocation, DB/SQS recovery, status vocabulary, public auth routes, and static routing.
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
| Authentication | Verify public registration/confirmation/login flow, correct user pool and token client, refresh/expiry, API Gateway authorization, FastAPI role checks, and cross-role denial. |
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
