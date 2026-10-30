# Pramāṇa — Person B Implementation Plan

This is the standalone implementation plan for Person B. It follows the project context in `context/person-a.md`, `context/person-b.md`, `context/person-c.md`, `context/pramana-context.md`, and `context/project.md`. The current A/B resource ownership split is documented in [`PERSON_A_B_WORK_SPLIT.md`](PERSON_A_B_WORK_SPLIT.md) and clarifies overlapping infrastructure assignments.

## Shared instructions for all implementation agents

1. Inspect the repository, all relevant context files, Git status, existing code, configuration, and available test commands before changing anything. Record unrelated changes and leave them untouched.
2. Keep each change within the existing assignment. Do not introduce additional product flows, services, data fields, roles, or deployment targets.
3. Implement in small stages: **implement → test → inspect results → continue**. A stage is complete only when its tests pass and its acceptance criteria below are met. Add tests with the code; do not postpone them to the end.
4. Use local fakes, fixtures, or SAM local where cloud resources are unavailable. Clearly label what was tested locally versus against deployed AWS resources. Never report a cloud integration as verified if it was only mocked.
5. Never commit AWS credentials, database passwords, real identity documents, or real customer data. Keep local `.env` files ignored; use Secrets Manager and encrypted Lambda configuration for deployed secrets.
6. Keep the existing stack: AWS SAM, S3/CloudFront, API Gateway, Lambda, Cognito, SQS, PostgreSQL/RDS, Tesseract/OpenCV, SNS, SES, and CloudWatch. The frontend in the current checkout is React + Vite + TypeScript/Tailwind with Amplify Auth and the existing API.
7. Where the source documents conflict, do not silently implement both behaviors. Resolve the item at the shared contract checkpoint below, record the selected existing behavior in a small integration contract/change note, and make all three implementations and tests match it. Do not treat unresolved contract questions as permission to add a feature.

## Shared integration contract and current handoff

The selected cross-person behavior is documented in [`INTEGRATION_DECISIONS_2026-10-29.md`](INTEGRATION_DECISIONS_2026-10-29.md). It supersedes the earlier unresolved contract table below; no design vote is pending.

### Live integration status — 2026-10-30

- The live database migration is at `001_initial_schema`; nine expected application tables and 67 ORM/live columns matched the catalog comparison, and `customers.date_of_birth` is `DATE NOT NULL`.
- The separate B API change set `pramana-b-api-20261030d` was reviewed and executed. Stack `pramana-dev-backend` is `CREATE_COMPLETE`; API URL: `https://rimait7lg7.execute-api.us-east-1.amazonaws.com/dev`. `/health` returns 200. The deployed synthetic workflow passed upload URL → S3 PUT → submit/SQS → OCR `REVIEW_REQUIRED` → reviewer queue/detail → re-upload decision → customer `REUPLOAD_PENDING` and audit. It used a blank synthetic Aadhaar PNG and `.invalid` users; SES correctly recorded the notification attempt as rejected. All test identities, rows, object versions, and temporary runner artifacts were removed.
- The API Lambda is Active in the shared private subnets and security group, with IPv6 enabled for dual-stack access. It uses retained shared layer v5; the latest foundation output is shared layer v7, so update the B stack only if a reviewed source/package change actually requires that version.
- SES sender `armaansyed009@gmail.com` is verified, but SES production access is disabled. SNS SMS attribute inspection fails because the account lacks the service subscription. Notification delivery remains blocked; no real customer messages were sent.
- Remaining B/API acceptance: run browser registration/confirmation and customer/reviewer UI acceptance after public frontend hosting/CORS are available; resolve SES production access and SNS service/use/spending prerequisites before real notification delivery. The API deployment change-set review gate was completed; no further API change set is pending.

The canonical details for queue retries, upload limits, status mapping, Cognito/Amplify ownership, notifications, and deployment blockers are in the linked decision record.

## Person B

The current A/B resource ownership split is documented in
[`PERSON_A_B_WORK_SPLIT.md`](PERSON_A_B_WORK_SPLIT.md); use it to resolve
overlapping AWS component responsibilities in this plan.

### Existing assigned responsibility

Own Cognito setup and configuration (customer/reviewer user pools and app clients), FastAPI, PostgreSQL schema/models/migrations, the RDS instance/database secret, Cognito integration, customer/KYC/reviewer API routes, backend Lambda/API Gateway resources, presigned URL generation, case/attempt management, audit writes, SQS producer, and SNS/SES notification resources and interface. Person B supplies pool/client and backend resource outputs to Person A, provides the API contract and public Cognito configuration Person C consumes, and coordinates the B-specific stack with Person A's shared SAM foundation and deployment review.

### Implementation objective

Deliver a tested API and data layer that enforces customer/reviewer authorization, persists the complete case and attempt history, safely coordinates document upload and OCR, exposes reviewer decisions and audit history, and exactly matches the shared API/status/message contracts.

### Prerequisites/dependencies

- Inspect current code and docs; coordinate with Person A before fixing table names, queue behavior, notification packaging, or environment names. Cognito settings and resource setup are Person B's responsibility; coordinate the resulting resource outputs with A and C.
- Use an isolated local/test database for migration and API tests. Obtain shared VPC, document-bucket, and queue outputs from Person A; provision the B-owned RDS/database secret and notification resources under the ownership split. Do not commit `.env` or credentials.
- Resolve the shared contracts, especially queue trigger, statuses, auth flow, comparison fields, and notifications.
- Provide Person C a versioned/typed API contract before the frontend consumes endpoints. Examples in `context/person-b.md` are the starting contract.

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

- Use the existing separate customer and reviewer pools/app clients; do not create replacement pools. Keep reviewer self-registration disabled and provide public configuration to Person C.
- Implement only public `POST /auth/register` and `POST /auth/confirm`; create the customer row after successful confirmation. Amplify owns sign-in, refresh, and sign-out, so do not expose duplicate `/auth/login`, `/auth/refresh`, or `/auth/logout` routes.
- Verify Cognito access-token signatures against the correct pool JWKS and validate issuer, expiry, `token_use=access`, and the pool's app-client `client_id` claim.
- Implement separate customer and reviewer dependencies. Resolve identities via Cognito `sub`; require an active reviewer record for reviewer routes. Do not authorize based only on client-side route checks.
- Return stable HTTP status/error shapes that Person C can display. Use separate configured customer/reviewer app-client IDs when validating each pool's tokens.

**Files/modules:** `services/cognito.py`, auth router/schemas, `dependencies.py`, configuration, authorization tests.

**Test and acceptance:** tests cover registration/confirmation outcomes, duplicate email/sub handling, invalid/expired/wrong-pool/wrong-client tokens, customer-to-reviewer and reviewer-to-customer access denial, inactive reviewers, and unauthenticated access to protected routes. Public auth routes remain callable without a bearer token.

#### B4. Implement customer, case, and upload endpoints

- Implement `GET/PUT /customer/profile` and `GET /customer/kyc/status` scoped to the authenticated customer's own record only.
- Implement `POST /kyc/upload-url`: validate document type, filename/content type against the agreed supported formats, allocate/resolve the attempt ID according to the shared attempt/key lifecycle contract, generate a short-lived presigned PUT for a server-derived key, and return `upload_url`, `s3_key`, and `expires_in` as documented. Never accept an arbitrary bucket/key from the client.
- Implement `POST /kyc/submit`: validate authenticated ownership and uploaded object/key using the chosen storage contract; persist/complete the case, attempt, and document rows according to the agreed attempt/key lifecycle; record submission audit state; and enqueue one agreed worker message if backend enqueueing is selected. Follow the agreed DB/SQS commit/recovery boundary so there is no accepted attempt without a job or job without its referenced data. Handle failures without telling the user processing began when it did not.
- Implement `GET /kyc/attempts` with attempt history in creation order and only for the owning customer.
- Keep old attempts and their results unchanged when a re-upload creates a later attempt.

**Files/modules:** customer and KYC routers, schemas, `services/s3.py`, `services/kyc_service.py`, SQS adapter, database transaction logic.

**Test and acceptance:** API tests verify request validation, ownership isolation, presigned URL fields/expiry, attempt ID/key allocation, abandoned/repeated URL requests, no arbitrary key injection, unsupported type rejection, no duplicate case/attempt on retries, one queue message per accepted attempt, DB/SQS failure ordering and recovery, no false PROCESSING response when enqueue fails, and preservation of attempt history. S3/SQS clients are mocked in unit tests and exercised against SAM/AWS in integration checks.

#### B5. Implement reviewer queries, decisions, and audit

- Implement `GET /reviewer/dashboard`, `/reviewer/queue`, `/reviewer/cases` with filters, `/reviewer/cases/{case_id}`, and `/reviewer/cases/{case_id}/audit` using the shapes in `context/person-b.md`.
- Generate short-lived GET URLs for document preview; do not expose public S3 paths.
- Return customer profile, latest attempt, extraction, field comparisons, full attempt history and audit trail needed by Person C.
- Implement `POST /reviewer/cases/{case_id}/decide` for `APPROVED`, `REJECTED`, and `REUPLOAD_REQUESTED`. Validate allowed current state and decision; save reviewer, timestamp and notes; update case/attempt according to the shared status map; append an audit event with relevant decision context. On re-upload, preserve the completed attempt and allow the next attempt under the existing case.
- Ensure the request cannot target a different customer's record by spoofing an identifier; reviewer access is limited to reviewer role, not a customer JWT.

**Files/modules:** reviewer router/schemas, query/service modules, audit model/service, decision transaction, tests.

**Test and acceptance:** tests cover dashboard counts, pagination/filtering, missing cases, presigned GET expiry, valid and invalid decision transitions, concurrent/repeated decision attempts, audit append behavior, re-upload history, and role enforcement. Every successful decision has one decision record and its corresponding audit event, without partial status changes if persistence fails.

#### B6. Implement notification adapter and worker integration contract

- Implement the `services/notification.py` interface described in Person B context for SNS/SMS and SES/email, but follow the resolved target and ownership matrix. Keep messages/templates aligned with Person A's context.
- Package/import the notification interface in the worker build as agreed with Person A; avoid a second conflicting implementation.
- Expose the schema/database integration contract to Person A: table/column names, status mapping, transaction expectations, and queue payload. If worker and API deploy separately, add a compatibility test against the same migration rather than importing local-only code implicitly.

**Test and acceptance:** unit tests assert exact templates/destinations, generic SMS rejection text, and no full mismatch values in SMS. Client failures are surfaced/logged safely and do not produce duplicate sends. A worker/API integration test confirms the same schema and module versions are used.

#### B7. Wire FastAPI, Mangum, and deployment

- Mount the documented auth, customer, KYC, and reviewer routes under their prefixes in `main.py`. Wrap the FastAPI app with Mangum. Do not add an undocumented product route just to satisfy a deployment smoke test.
- Coordinate the backend Lambda name, handler, runtime, env variables, IAM requirements, VPC access, timeout, and API Gateway routes with Person A's SAM template.
- Run migrations with an explicit deployment/runbook step coordinated with Person A; do not make every Lambda cold start run schema migrations.

**Test and acceptance:** local Uvicorn and SAM local start; smoke tests exercise public register/confirm and authenticated customer/reviewer routes through Mangum/API Gateway event format; Lambda package imports; migration is deployed before API/worker version requiring new columns; CloudWatch errors are actionable and secret-free.

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
