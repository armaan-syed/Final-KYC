# Pramāṇa — Person B Implementation Plan

This is the standalone implementation plan for Person B. It follows the existing assignments in `context/person-a.md`, `context/person-b.md`, `context/person-c.md`, `context/pramana-context.md`, and `context/project.md`; it does not change ownership or add product scope.

## Shared instructions for all implementation agents

1. Inspect the repository, all relevant context files, Git status, existing code, configuration, and available test commands before changing anything. Record unrelated changes and leave them untouched.
2. Keep each change within the existing assignment. Do not introduce additional product flows, services, data fields, roles, or deployment targets.
3. Implement in small stages: **implement → test → inspect results → continue**. A stage is complete only when its tests pass and its acceptance criteria below are met. Add tests with the code; do not postpone them to the end.
4. Use local fakes, fixtures, or SAM local where cloud resources are unavailable. Clearly label what was tested locally versus against deployed AWS resources. Never report a cloud integration as verified if it was only mocked.
5. Never commit AWS credentials, database passwords, real identity documents, or real customer data. Keep local `.env` files ignored; use Secrets Manager and encrypted Lambda configuration for deployed secrets.
6. Keep the existing stack: AWS SAM, S3/CloudFront, API Gateway, Lambda, Cognito, SQS, PostgreSQL/RDS, Tesseract/OpenCV, SNS, SES, and CloudWatch. The frontend remains Next.js/React/TypeScript/Tailwind with Amplify Auth and the existing API.
7. Where the source documents conflict, do not silently implement both behaviors. Resolve the item at the shared contract checkpoint below, record the selected existing behavior in a small integration contract/change note, and make all three implementations and tests match it. Do not treat unresolved contract questions as permission to add a feature.

## Shared contract checkpoint before cross-person integration

The context documents contain several interface disagreements. Each person can proceed on independent work, but the following contracts must be settled and recorded before the affected components are joined. The purpose is to implement the assigned system without duplicate triggers, incompatible schemas, or guessed behavior.

| Contract | What the context says | Required resolution and verification |
|---|---|---|
| Upload-to-OCR queue trigger | Person B and Person C say `POST /kyc/submit` creates the attempt and sends a complete message to SQS. Person A and the architecture diagram also describe an S3 event triggering SQS. | Agree on exactly one enqueue path. The worker message must identify `kyc_attempt_id`, `kyc_case_id`, `customer_id`, `s3_bucket`, `s3_key`, and `document_type`. Test that one successful upload creates one attempt and one OCR job, with no duplicate processing. Do not enable both triggers. |
| KYC status vocabulary | Docs use `REVIEW_REQUIRED`, `REUPLOAD_PENDING`, and `REUPLOAD_REQUESTED` in different places. `REVIEW_REQUIRED` appears in API/attempt examples but is missing from the frontend `KYCStatus` union and the project-level case-status table. | Agree on persisted case statuses, attempt statuses, and API-visible statuses separately; map them explicitly. Update backend enums/schemas and frontend types/badges together. Test each allowed transition and reject unknown values. |
| Authentication entry points | Person B defines `/auth/register`, `/auth/confirm`, `/auth/login`, `/auth/refresh`, `/auth/logout`; Person C's API client includes register/login, while its page notes also call Amplify `signIn()`/`signUp()` directly. | Select one consistent frontend-to-Cognito flow using the already-defined routes and Amplify responsibilities. Ensure registration confirmation, login, refresh, logout, and bearer-token attachment have one owner each. Verify customer and reviewer tokens against their respective pools and clients. |
| Cognito frontend configuration | Person A/B specify separate customer and reviewer user pools; Person C shows a single pool ID/client ID in frontend environment variables. | Define the customer and reviewer public pool/client configuration needed by the two portals. Verify a customer cannot enter reviewer APIs and a reviewer cannot use customer-only APIs. Do not expose secrets in `NEXT_PUBLIC_*` variables. |
| Notification ownership and target | Person A owns AWS SNS/SES resources and describes worker notifications; Person B provides a notification service that Person A imports, while also owning reviewer decisions. The examples differ between publishing to an SNS topic and publishing directly to a phone number. | Agree who invokes the shared notification code for each existing event (automated result versus reviewer decision), how it is packaged for both Lambdas, and whether SMS uses the configured topic or direct phone delivery. Test one notification per state transition, with no duplicate sends. Preserve generic rejection SMS and portal-only rejection detail. |
| Comparison fields and match rule | Aadhaar address is described as optional/lower-weight in Person A's notes; other examples imply all compared fields are required for 100% auto-verification. PAN number is stored but not compared. | Record the exact compared/required field list and how absent OCR fields affect the result. Keep document-specific rules: Aadhaar name/DOB/gender and the documented address rule; PAN name/DOB; PAN identifier is stored. Unit-test exact 100% auto-verify and mismatch-to-review behavior. |
| Static frontend routing | Person C specifies S3/CloudFront static export and also shows Next middleware plus a dynamic `/reviewer/cases/[caseId]` page. Static export does not run Next server middleware and requires a deployable route strategy for dynamic IDs. | Keep the assigned static hosting target. Choose and verify a route-guard and case-detail URL strategy that works in the generated static output and CloudFront. The backend remains the authorization boundary regardless of client route guards. |
| Supported upload formats | Frontend accepts JPEG, PNG, and PDF; the OCR examples preprocess an image with OpenCV. | Retain the formats explicitly accepted by the frontend and verify each through the OCR pipeline, or reconcile the allowed format list before narrowing it. Do not claim PDF support until the worker can process a PDF test fixture. |

When no person can settle a contract from the current context, record the exact question and its blocked integration step for the project owner. Continue unrelated work with a mock of the agreed interface; do not invent a new behavior.

---

## Person B

### Existing assigned responsibility

Own FastAPI, PostgreSQL schema/models/migrations, Cognito integration, customer/KYC/reviewer API routes, presigned URL generation, case/attempt management, audit writes, SQS integration, and the notification service interface. Person B deploys the backend Lambda through Person A's SAM stack and provides the API contract Person C consumes.

### Implementation objective

Deliver a tested API and data layer that enforces customer/reviewer authorization, persists the complete case and attempt history, safely coordinates document upload and OCR, exposes reviewer decisions and audit history, and exactly matches the shared API/status/message contracts.

### Prerequisites/dependencies

- Inspect current code and docs; coordinate with Person A before fixing table names, queue behavior, Cognito settings, notification packaging, or environment names.
- Obtain local/test database configuration and secure AWS values from Person A. Do not commit `.env` or credentials.
- Resolve the shared contracts, especially queue trigger, statuses, auth flow, comparison fields, and notifications.
- Provide Person C a versioned/typed API contract before the frontend consumes endpoints. Examples in `person-b.md` are the starting contract.

### Step-by-step implementation plan

#### B1. Establish the backend skeleton and configuration

- Create or extend the documented structure: `app/main.py`, `config.py`, `database.py`, `dependencies.py`, `models/`, `schemas/`, `routers/`, `services/`, `migrations/`, `requirements.txt`, and a local env example.
- Configure settings for DB, region, both Cognito pools/clients, document bucket, queue, sender and notification resources. Validate required settings at startup; never include secret values in errors or logs.
- Set up deterministic local database/test configuration and dependency overrides for FastAPI tests.

**Test and acceptance:** app imports and serves locally; invalid/missing configuration fails with a useful, non-secret message; no real AWS call is needed to run unit/API tests.

#### B2. Implement models, constraints, and migrations

- Implement the documented tables: `customers`, `kyc_cases`, `kyc_attempts`, `kyc_documents`, `extracted_fields`, `field_comparisons`, `kyc_decisions`, `audit_events`, and `reviewers`.
- Preserve the documented one-customer case and one-attempt document/decision constraints, UUID keys, timestamps, foreign keys, status columns, and indexes. Make audit events append-only in application behavior; do not add update/delete endpoints.
- Define status constants/enums only after the shared contract checkpoint. Keep case status and attempt status distinct if the agreed model requires both.
- Create Alembic migration(s) and verify upgrade/downgrade behavior against an isolated test PostgreSQL database. Do not run destructive migrations against production or shared data.

**Files/modules:** ORM models, migration environment, initial migration, model factories/fixtures.

**Test and acceptance:** migration creates the documented schema from an empty DB; ORM relationships and uniqueness/FK constraints are verified; invalid case/attempt relationships fail; audit data is readable in chronological order and has no normal mutation path.

#### B3. Implement Cognito registration, confirmation, and authorization

- Implement public `/auth/register` and `/auth/confirm` using the configured customer pool. Create the customer row only after successful confirmation, following the context flow.
- Implement the agreed `/auth/login`, `/auth/refresh`, and `/auth/logout` behavior without duplicating Amplify-owned Cognito actions. Match the resolved frontend auth contract.
- Verify JWT signature using the correct user pool JWKS and validate issuer, expiry, token use and the correct app client/audience according to the chosen Cognito token type.
- Implement separate customer and reviewer dependencies. Resolve identities via Cognito `sub`; require an active reviewer record for reviewer routes. Do not authorize based only on client-side route checks.
- Return stable HTTP status/error shapes that Person C can display.

**Files/modules:** `services/cognito.py`, auth router/schemas, `dependencies.py`, configuration, authorization tests.

**Test and acceptance:** tests cover registration/confirmation outcomes, duplicate email/sub handling, invalid/expired/wrong-pool/wrong-client tokens, customer-to-reviewer and reviewer-to-customer access denial, inactive reviewers, and unauthenticated access to protected routes. Public auth routes remain callable without a bearer token.

#### B4. Implement customer, case, and upload endpoints

- Implement `GET/PUT /customer/profile` and `GET /customer/kyc/status` scoped to the authenticated customer's own record only.
- Implement `POST /kyc/upload-url`: validate document type, filename/content type against the agreed supported formats, generate a short-lived presigned PUT for a server-derived key, and return `upload_url`, `s3_key`, and `expires_in` as documented. Never accept an arbitrary bucket/key from the client.
- Implement `POST /kyc/submit`: validate authenticated ownership and uploaded object/key using the chosen storage contract; create the case if required, create a new attempt/document row, record submission audit state, and enqueue exactly one agreed worker message if backend enqueueing is the selected contract. Handle failed DB/SQS operations consistently so the user is not told processing began when it did not.
- Implement `GET /kyc/attempts` with attempt history in creation order and only for the owning customer.
- Keep old attempts and their results unchanged when a re-upload creates a later attempt.

**Files/modules:** customer and KYC routers, schemas, `services/s3.py`, `services/kyc_service.py`, SQS adapter, database transaction logic.

**Test and acceptance:** API tests verify request validation, ownership isolation, presigned URL fields/expiry, no arbitrary key injection, unsupported type rejection, no duplicate case/attempt on retries, one queue message per accepted attempt, no false PROCESSING response when enqueue fails, and preservation of attempt history. S3/SQS clients are mocked in unit tests and exercised against SAM/AWS in integration checks.

#### B5. Implement reviewer queries, decisions, and audit

- Implement `GET /reviewer/dashboard`, `/reviewer/queue`, `/reviewer/cases` with filters, `/reviewer/cases/{case_id}`, and `/reviewer/cases/{case_id}/audit` using the shapes in `person-b.md`.
- Generate short-lived GET URLs for document preview; do not expose public S3 paths.
- Return customer profile, latest attempt, extraction, field comparisons, full attempt history and audit trail needed by Person C.
- Implement `POST /reviewer/cases/{case_id}/decide` for `APPROVED`, `REJECTED`, and `REUPLOAD_REQUESTED`. Validate allowed current state and decision; save reviewer, timestamp and notes; update case/attempt according to the shared status map; append an audit event with relevant decision context. On re-upload, preserve the completed attempt and allow the next attempt under the existing case.
- Ensure the request cannot target a different customer's record by spoofing an identifier; reviewer access is limited to reviewer role, not a customer JWT.

**Files/modules:** reviewer router/schemas, query/service modules, audit model/service, decision transaction, tests.

**Test and acceptance:** tests cover dashboard counts, pagination/filtering, missing cases, presigned GET expiry, valid and invalid decision transitions, concurrent/repeated decision attempts, audit append behavior, re-upload history, and role enforcement. Every successful decision has exactly one decision record and one corresponding audit event.

#### B6. Implement notification adapter and worker integration contract

- Implement the `services/notification.py` interface described in Person B context for SNS/SMS and SES/email, but follow the resolved target and ownership matrix. Keep messages/templates aligned with Person A's context.
- Package/import the notification interface in the worker build as agreed with Person A; avoid a second conflicting implementation.
- Expose the schema/database integration contract to Person A: table/column names, status mapping, transaction expectations, and queue payload. If worker and API deploy separately, add a compatibility test against the same migration rather than importing local-only code implicitly.

**Test and acceptance:** unit tests assert exact templates/destinations, generic SMS rejection text, and no full mismatch values in SMS. Client failures are surfaced/logged safely and do not produce duplicate sends. A worker/API integration test confirms the same schema and module versions are used.

#### B7. Wire FastAPI, Mangum, and deployment

- Mount routes under the documented prefixes in `main.py`; expose only the health/diagnostic endpoint already supported by the deployment needs and keep it free of secrets. Wrap with Mangum.
- Coordinate the backend Lambda name, handler, runtime, env variables, IAM requirements, VPC access, timeout, and API Gateway routes with Person A's SAM template.
- Run migrations with an explicit deployment/runbook step coordinated with Person A; do not make every Lambda cold start run schema migrations.

**Test and acceptance:** local Uvicorn and SAM local start; route smoke tests work through Mangum/API Gateway event format; Lambda package imports; migration is deployed before API/worker version requiring new columns; CloudWatch errors are actionable and secret-free.

### Integration requirements/checkpoints

- **B/A schema checkpoint:** Person A demonstrates worker writes into a DB migrated by B; compare status updates, field names, date formats, and transaction behavior.
- **B/C API checkpoint:** share a schema/endpoint contract for every route, including exact error body, status enums, optional values, timestamps and pagination. Run contract tests from both sides before page integration.
- **B/C auth checkpoint:** verify chosen auth flow end-to-end, token refresh/expiry, separate pools and role rejection.
- **B/A/C upload checkpoint:** exercise presign → direct PUT → submit → one queue job → worker result → status polling, including upload/queue failure.
- **B/A notification checkpoint:** assert one notification after automated transitions and reviewer decisions according to the event owner matrix.

### Final verification and acceptance

- Database migration is reproducible; API runs locally and through SAM; all routes enforce correct roles and customer ownership; case and attempt lifecycle is consistent; OCR writes appear in all expected tables; reviewer decisions and audit history persist; notification calls follow the agreed event contract; error responses are stable and documented.

### Handoff/completion requirements

- API contract and sample payloads, migration/run instructions, `.env.example`, settings list, local/SAM commands, worker SQS schema, status transition table, notification interface and tested deployment handler. Share only public configuration in frontend handoff; pass secrets via secure channels.

---
