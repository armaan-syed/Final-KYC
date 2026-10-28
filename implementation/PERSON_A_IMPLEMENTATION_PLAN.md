# Pramāṇa — Person A Implementation Plan

This is the standalone implementation plan for Person A. It follows the project context in `context/person-a.md`, `context/person-b.md`, `context/person-c.md`, `context/pramana-context.md`, and `context/project.md`. The current A/B resource ownership split is documented in [`PERSON_A_B_WORK_SPLIT.md`](PERSON_A_B_WORK_SPLIT.md) and clarifies overlapping infrastructure assignments.

## Shared instructions for all implementation agents

1. Inspect the repository, all relevant context files, Git status, existing code, configuration, and available test commands before changing anything. Record unrelated changes and leave them untouched.
2. Keep each change within the existing assignment. Do not introduce additional product flows, services, data fields, roles, or deployment targets.
3. Implement in small stages: **implement → test → inspect results → continue**. A stage is complete only when its tests pass and its acceptance criteria below are met. Add tests with the code; do not postpone them to the end.
4. Use local fakes, fixtures, or SAM local where cloud resources are unavailable. Clearly label what was tested locally versus against deployed AWS resources. Never report a cloud integration as verified if it was only mocked.
5. Never commit AWS credentials, database passwords, real identity documents, or real customer data. Keep local `.env` files ignored; use Secrets Manager and encrypted Lambda configuration for deployed secrets.
6. Keep the existing stack: AWS SAM, S3/CloudFront, API Gateway, Lambda, Cognito, SQS, PostgreSQL/RDS, Tesseract/OpenCV, SNS, SES, and CloudWatch. The frontend remains Next.js/React/TypeScript/Tailwind with Amplify Auth and the existing API.
7. Where the source documents conflict, do not silently implement both behaviors. Resolve the item at the shared contract checkpoint below, record the selected existing behavior in a small integration contract/change note, and make all three implementations and tests match it. Do not treat unresolved contract questions as permission to add a feature.

## Shared contract checkpoint

The code now implements this A/B baseline locally. It is ready for Person B to confirm before deployment:

- **Queue path and message:** `POST /kyc/submit` is the only producer. The queue is standard; no S3 event sends messages. The body is exactly `kyc_attempt_id`, `kyc_case_id`, `customer_id`, `s3_bucket`, `s3_key`, and `document_type`. S3 `ContentType` is read from the uploaded object.
- **Attempt and key lifecycle:** `/kyc/upload-url` creates the PROCESSING attempt; the key is `documents/{customer_id}/{attempt_id}/{file_name}`. `/kyc/submit` persists the document row, commits it, then sends SQS. Abandoned attempts stay PROCESSING.
- **Database/SQS recovery:** commit-before-send prevents the worker seeing uncommitted records, and duplicate standard-queue messages are idempotent. There is no transactional outbox: if SQS send fails after commit and the client does not retry, the attempt can remain PROCESSING. Agree the repair/outbox behavior with B before production.
- **Statuses:** cases use `PENDING`, `PROCESSING`, `AUTO_VERIFIED`, `REVIEW_REQUIRED`, `APPROVED`, `REJECTED`, `REUPLOAD_PENDING`; attempts use `PROCESSING`, `AUTO_VERIFIED`, `REVIEW_REQUIRED`, `APPROVED`, `REJECTED`, `REUPLOAD_REQUESTED`. Reviewer re-upload decisions update the old attempt to `REUPLOAD_REQUESTED` and case to `REUPLOAD_PENDING`; a new attempt preserves its history.
- **Comparison:** current fields are `name`, `date_of_birth`, and `gender` for Aadhaar; `name` and `date_of_birth` for PAN. Aadhaar address, Aadhaar number, and PAN number are extracted and stored but not compared. Person A's source describes address as optional/lower-weight; exact confidence and score rules need B/A agreement before adding it. Missing required values cause `REVIEW_REQUIRED`. The worker stores `match_percentage` in audit JSON because B's schema has no dedicated score column.
- **Notifications:** the worker sends the shared generic SMS and email after an `AUTO_VERIFIED` commit. B's reviewer decision path sends its existing decision notifications. Current code sends SMS directly to the customer phone through SNS; it does not publish customer messages to B's proposed SNS topic. Submission/re-upload notifications are not currently sent. Ordinary redelivery does not repeat a committed worker notification; provider delivery remains best-effort and can be uncertain across a process crash.
- **Authentication:** B's FastAPI validates customer/reviewer Cognito JWTs. Cognito pool/client outputs and an API Gateway authorizer design are not in the repo yet; the shared root stack does not wire authorizers into B's separate REST API. This boundary remains open.

Person B should review the baseline above, especially the commit/send recovery gap, SMS destination, and notification event matrix. Person C should align displayed case/attempt states to the implemented status map.

---

## Person A

### Existing assigned responsibility

Own the shared AWS foundation and OCR worker: VPC/network foundation, private document and frontend storage, SQS/DLQ and OCR Lambda/layer, CloudFront, CloudWatch, shared SAM integration, and deployment review. Person B owns Cognito, the RDS instance/database secret, backend Lambda/API resources, and notification-specific SNS/SES resources as defined in the A/B work split. Person A wires the shared components and B's outputs together and implements the worker's database/notification integration.

### Implementation objective

Deliver a deployable, least-privilege AWS stack and a working OCR worker that accepts the agreed SQS contract, processes documents, persists extraction/comparison outcomes using Person B's schema, sets the agreed status, and emits the correct existing notifications.

### Person A execution status

#### Implemented and locally verified

- [x] Inspected the project context and repository state. No unrelated pre-existing changes were present; Person B and Person C AWS access has not been modified.
- [x] Built the Aadhaar/PAN OCR parser, normalization, comparison, synthetic fixtures, and original Python 3.12 Lambda runtime proof. The 2026-10-28 proof passed for synthetic Aadhaar PNG, PAN PNG, and Aadhaar PDF; recorded times were below one second each.
- [x] Implemented the SQS worker, server-derived key and bucket checks, S3 document handling, status rules, transactional PostgreSQL writes, duplicate-delivery locking, partial batch retry response, and shared SNS/SES notification adapter.
- [x] Aligned B's producer with the standard queue and six-field message. The backend now commits document/attempt rows before enqueueing and maps case/attempt re-upload states separately.
- [x] Fixed B/A integration defects in the migration: JSONB argument spelling and database UUID server defaults required for direct worker inserts. Added the VPC ENI execution policy to B's VPC-attached Lambda role.
- [x] Ran a disposable PostgreSQL integration check using the current migration DDL and worker repository: one transaction persisted extraction, comparisons, status, decision, and audit; redelivery created no duplicate rows. The host's PostgreSQL build does not include `pgcrypto`, so only that extension statement was omitted from the temporary test copy.
- [x] Mapped Tesseract word confidence to parsed fields when their OCR tokens match, persisted that value in B's nullable `confidence` column, and retained `NULL` if a reliable token mapping is unavailable.
- [x] Ran the OCR/worker/database suite: 28 passed, with the PostgreSQL integration test skipped when no dedicated test database URL is configured. A prior run against a disposable migrated PostgreSQL database passed. The current backend suite passes 16 tests.
- [x] Expanded the shared SAM template with the private VPC, subnets/NAT, security groups, private buckets and CloudFront OAC, encrypted standard queue/DLQ, conditional OCR worker/layers, least-privilege role, alarms, and operations dashboard. B's backend template now accepts A's network/bucket/queue outputs, loads DB credentials from Secrets Manager with verified TLS, and runs inside the VPC.
- [x] Parsed both current SAM templates locally and checked `Ref`, `GetAtt`, and `Sub` names: 43 root resources and 3 backend resources, with no unresolved local references.
- [x] Ran `cfn-lint` 1.58.0 on both current templates successfully, excluding W1030 for caller-supplied ARN string parameters.

#### Remaining before calling Person A complete

- [x] Built and validated the updated layer in the official Python 3.12 x86_64 Lambda runtime: Tesseract 5.5.2, Leptonica 1.87.0, OpenCV 5.0.0, NumPy 2.5.4, PDFium 5.14.0, and psycopg2 2.9.10 imported; native libraries and English/Hindi language data passed checks. The actual worker auto-verified synthetic Aadhaar PNG, PAN PNG, and Aadhaar PDF inputs at 100%, with name confidence 95–96 and runtimes 0.33–0.73s.
- [x] Measured the layer ZIP at 93,834,078 bytes and its expanded contents at 250,219,932 bytes. Function code plus all attached layers measured 258,176,462 bytes against the 262,144,000-byte Lambda quota, leaving only 3,967,538 bytes of headroom. The ZIP exceeds direct upload size and must be staged through S3.
- [x] Ran basic `sam validate` on the current root and backend templates and a containerized `sam build` of the root stack. `cfn-lint` passes both templates with W1030 excluded.
- [ ] Run AWS CloudFormation `validate-template` and prepare the foundation change set with a usable non-root IAM profile; review and approve the change set before executing it.
- [ ] Obtain B's Cognito pool/client IDs, RDS endpoint/secret ARN, sender identity, queue and API outputs. Confirm the API Gateway authorizer boundary, SNS topic versus direct-phone behavior, and event ownership.
- [ ] Resolve the DB/SQS commit/send recovery gap and DLQ attempt-state recovery with B/C, optional Aadhaar address comparison/weighting with B, upload size/PDF page limits with B/C, and frontend status handling with C.
- [ ] Deploy the shared and B-owned stacks only after the account-specific cost review and concrete change-set review. No AWS resources have been deployed.
- [ ] Run deployed upload → SQS → OCR → RDS → API/UI → reviewer → audit/notification checks, then complete the resource/output handoff.

The current expanded templates pass basic SAM validation, a containerized root SAM build, and `cfn-lint` (with W1030 excluded for externally supplied ARN string parameters). They have not passed `cfn-guard` or AWS `validate-template`. The OCR proof ran in the official Lambda runtime image through the rootless Podman-compatible engine; it did not use host-installed Tesseract/OpenCV. No AWS deployment or cloud integration is claimed.

### Prerequisites and dependencies

- Inspect the current tree and the Person A, B, and project context documents.
- Obtain the AWS account/region and secure deployment access. Use a separate administrative identity for daily work; never use root credentials in development.
- Agree with Person B on migration/schema ownership, table/column names, transaction expectations, and the SQS message shape before the worker writes to RDS.
- Resolve the upload-to-SQS, status, comparison-field, notification, and upload-format contracts above.
- Obtain Person B's Cognito pool/client configuration plus the required S3/SQS/API values for infrastructure wiring. Store secrets in Secrets Manager or encrypted Lambda configuration, not source control.

### Step-by-step implementation plan

#### A1. Inspect and establish the infrastructure baseline

- Inspect repository conventions, existing SAM files, AWS profiles, ignored files, and deployment scripts. Do not overwrite an existing stack.
- If no implementation exists, establish an infrastructure folder with a SAM template, parameter/config examples, deployment instructions, and separate OCR worker source/tests. Keep resource names and outputs consistent with the `pramana-*` names in context.
- Keep Person B and Person C's existing `AdministratorAccess` unchanged during this implementation, as explicitly directed by Person A. Person A will remove their access manually after the implementation. Do not edit their users, groups, or policies. Never distribute root credentials.
- Create a resource/output inventory for Person B and C, including the Cognito outputs supplied by Person B.

**Files/modules:** SAM `template.yaml` (at the agreed repo location), SAM config/parameter examples, deployment README or the existing equivalent, OCR source and test modules.

**Test and acceptance:** SAM template validates locally; parameter files contain placeholders only; IAM policies are reviewed for least privilege; resource outputs expose the region, bucket names, queue URL, Cognito IDs, API URL, CloudFront domain/distribution, and notification configuration needed by teammates. No credentials appear in Git.

#### A2. Prove the OCR runtime before building the full stack

- Build a minimal Lambda layer for the selected Lambda architecture with Tesseract, `pytesseract`, OpenCV, and the required English/Hindi language data from the context.
- Confirm the packaged layer fits within the documented 250 MB unzipped limit and that the binary runs in the Lambda-compatible environment.
- Run representative, non-sensitive Aadhaar and PAN fixtures through preprocessing and OCR. Check raw output, parser inputs, execution duration, and Lambda-compatible filesystem use (`/tmp`).
- Keep the documented Rekognition DetectText fallback as a contingency only if the Tesseract POC fails; report the failure and required contract/cost changes before switching.

**Files/modules:** layer build recipe, layer contents, a small POC Lambda handler, sanitized OCR fixtures, POC instructions/results.

**Test and acceptance:** layer imports and invokes inside the target Lambda runtime; both fixture types produce raw text usable by the parser; size is within limit; record timing against Person A's documented target of under 30 seconds and the worker timeout of 120 seconds with queue visibility at least six times that timeout, plus limitations. Do not proceed on an unverified assumption that local desktop OpenCV/Tesseract will run on Lambda.

#### A3. Implement SAM infrastructure in dependency order

1. Define parameters for region, stage, domain/origin settings, DB sizing, and sender configuration; provide safe demo defaults only where the context already defines them.
2. Provision the VPC/private subnets, shared route/egress path, and network/security-group foundation. Person B provisions the private PostgreSQL RDS instance and its Secrets Manager credential inside this network, using the documented demo settings where available. Coordinate security-group rules so only the backend and OCR worker can reach PostgreSQL on port 5432. Verify required private-subnet service connectivity without making RDS public.
3. Provision the private, versioned, SSE-S3 document bucket with all public access blocked and the agreed CORS origin/methods for presigned PUT. Use bucket policies/IAM roles limited to this bucket. Enable the documented document-bucket access logging to a separate private log bucket.
4. Provision the frontend S3 bucket as private and serve it through CloudFront with OAC, consistent with Person A's detailed bucket security section and the project architecture. Do not deploy a public S3 website endpoint.
5. Provision the standard OCR queue and DLQ with 720-second visibility timeout (six times the 120-second worker timeout), 4-day main-queue retention, 14-day DLQ retention, redrive after 3 failed receives, batch size 1, and maximum worker concurrency 5. Wire only the selected enqueue path from the contract checkpoint.
6. Consume the customer and reviewer Cognito user pools/app clients configured by Person B. Wire the matching pool issuers and client audiences into the agreed API Gateway route authorizers; keep only the agreed auth endpoints public.
7. Provision the Tesseract/OpenCV layer and OCR worker Lambda. Person B supplies the backend Lambda/API Gateway and SNS/SES resource definitions and owns the B-specific component stack; integrate those resources with the shared API, queue, and network contracts. Add the shared CloudWatch log groups/alarms/dashboard and secret references. Configure throttling to the documented 50 requests/second steady and 100 requests/second burst limits.
8. Give each Lambda its own execution role with least-privilege access to only the resources it needs. Keep the OCR role limited to its bucket/queue/database/notification access and backend role limited to the backend's resources.

**Files/modules:** SAM resource definitions, IAM policies, security-group rules, S3 bucket policies/CORS, CloudFront OAC config, queue/DLQ config, API Gateway authorizer wiring for Person B's Cognito resources, secrets/env parameter references, outputs.

**Test and acceptance:** run SAM/template lint or validation after each resource group; inspect the generated change set before deployment; verify public access is blocked on documents and frontend bucket while CloudFront OAC can read frontend assets; verify RDS is private and only Lambda security groups can reach it; verify private Lambda connectivity, per-pool API authorizers, public auth routes, API throttling, queue retry/DLQ settings and CORS with the configured frontend origin. Confirm the regional/account cost assumptions against the project's free-tier-first constraint before deploying. Use deployed smoke checks for security properties that local validation cannot prove.

#### A4. Implement the OCR worker and domain processing

- Keep processing modules small and independently testable: SQS handler, S3 download/temporary-file handling, image handling and Lambda-compatible PDF page rendering, OpenCV preprocessing, Tesseract invocation, Aadhaar parser, PAN parser, normalization, verification rules, database persistence adapter, and notification adapter.
- Validate incoming SQS messages. Reject unsupported document types and malformed messages in a way compatible with SQS retry/DLQ behavior; never mark an attempt complete before persistence succeeds.
- Preprocess images using the documented grayscale, denoise, threshold and deskew steps where appropriate. Run Tesseract with the configured language data and page segmentation mode from the context.
- Parse Aadhaar name, DOB, gender, number and address as described; parse PAN name, father's name, DOB and identifier as described. Normalize names, dates, and gender before comparison; map parser names such as `dob` to the agreed canonical schema/API names, and persist OCR confidence when the engine provides it. Do not expose or log full document contents or identity numbers.
- Compare only the fields set by the shared contract. Persist one extracted-field row per extracted field, one comparison row per compared field, attempt/case status, completion time, system decision when auto-verified, and system audit event using Person B's agreed schema.
- On full required-field match, store `AUTO_VERIFIED`; on mismatch or missing/unreliable required data, use the agreed review state. Calculate the documented match percentage and persist/return it only as specified by the resolved contract. Preserve the original attempt and never overwrite prior attempt results.
- Make database writes transactional and guard completed attempts so SQS redelivery does not duplicate extracted fields, comparisons, decisions, audit entries, or routine notification attempts. Delete/acknowledge an SQS message only after required processing/persistence succeeds. Allow configured retries and eventual DLQ routing on failure.
- Measure database connection behavior on cold starts; if the documented RDS cold-start risk appears, use only the mitigation already named in context (RDS Proxy or keeping Lambda warm) after recording its cost/operational impact.

**Files/modules:** OCR handler, preprocessing, text extraction, parsers, normalization/verification, RDS repository adapter, worker configuration, unit and worker integration tests.

**Test and acceptance:** unit tests cover clean and noisy fixtures, field extraction/confidence where available, date/name normalization, missing/invalid values, Aadhaar/PAN field rules, exact-match and mismatch decisions, JPEG/PNG/PDF processing, database write failures, duplicate delivery, and malformed queue messages. A worker integration test verifies SQS input through RDS writes and final status. A failed write leaves the message retryable; a successful job creates exactly one logical result.

#### A5. Integrate notifications, monitoring, and alarms

- Integrate Person B's shared notification module and SES sender configuration with the worker. Current B code sends SMS directly to a phone number through SNS, not through the proposed customer SNS topic; confirm this choice with B. Document SES sandbox verification requirements and the India SMS/DLT limitations noted in Person A's context.
- Coordinate with Person B on the notification module/package interface and invocation ownership. Send the worker auto-verification notification after persistence. B owns reviewer-decision notifications; document-submitted and re-upload notification behavior remains to be agreed. Suppress ordinary duplicate worker sends. Rejection SMS remains generic; detailed mismatch values remain portal-only.
- Add the documented CloudWatch log groups, metric filters, alarms, and dashboard. Configure alarms at the stated thresholds: any DLQ message, more than 5 Lambda errors in 5 minutes, RDS CPU above 80% for 5 minutes, and more than 10 API 5xx errors in 5 minutes. CloudTrail remains optional/recommended as the source context states.
- Ensure logs include correlation identifiers and status without full OCR text, document bytes, passwords, tokens, or full identity numbers.

**Test and acceptance:** notification unit tests use mocked clients and assert destination/template selection and failure handling; deployed tests use verified sandbox recipients and a safe test number when available. Confirm alarm metrics and log groups are created and a test DLQ message can trigger the expected alarm.

#### A6. Deploy and hand off

- Deploy the shared foundation in dependency order with `sam deploy`; review and approve B's component-stack change set before B provisions it. Run migrations only when Person B supplies the reviewed migration and coordinates the database run.
- Provide Person B the VPC/subnet/security-group references, document bucket, queue URL/ARN and message contract, OCR worker/layer outputs, and region through the agreed handoff. Person B provides A the RDS endpoint/name/port/secret ARN, Cognito IDs, backend API outputs, and SNS/SES configuration.
- Provide Person C the API URL, CloudFront URL/distribution, frontend bucket, region, and CORS origin details. Person B provides Person C the customer/reviewer public Cognito configuration.
- Record deployed resource identifiers and verification evidence in a handoff note without publishing secrets.

### Integration requirements and checkpoints

- **Checkpoint A/B — before worker database writes:** Person B reviews schema/migration and agrees exact columns, enum values, relationships, transaction behavior, and whether worker persistence uses shared models or a stable SQL contract. Run a schema compatibility test against a migrated test database.
- **Checkpoint A/B/C — before upload deployment:** agree trigger path, presigned key shape, content types, SQS payload, status transitions, and one-job-per-attempt behavior. Run an upload-to-queue contract test.
- **Checkpoint A/B — notifications:** Person B's service interface must be importable in both the API and worker deployment packages, or an already-existing equivalent must be used. Test notification ownership per event.
- **Checkpoint A/C — deployment:** verify CloudFront static routes, public API origin/CORS, frontend environment values, and Cognito public config using the actual exported build.

### Final verification and acceptance

- Clean deployment succeeds; documented public auth endpoints and customer/reviewer protected routes behave correctly; presigned upload and private bucket access behave as expected; queue retry and DLQ route work; OCR worker completes sanitized Aadhaar, PAN, and PDF checks; RDS remains private; alarms/logs are present; all outputs match the shared contract.

### Handoff/completion requirements

- Infrastructure source, layer build process, OCR code/tests, deployment/runbook, environment-variable names, migration coordination steps, resource outputs, and known AWS account/demo constraints.
- Evidence of validation and deployed smoke checks; clear distinction between mocked/local checks and AWS-verified checks.
- No uncommitted secrets, temporary documents, unrelated changes, or undocumented manual resource dependencies.

---
