# Pramāṇa — Person A Implementation Plan

This is the standalone implementation plan for Person A. It follows the existing assignments in `context/person-a.md`, `context/person-b.md`, `context/person-c.md`, `context/pramana-context.md`, and `context/project.md`; it does not change ownership or add product scope.

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

## Person A

### Existing assigned responsibility

Own the AWS backbone and deployment: account/IAM setup, SAM infrastructure, private document and frontend storage, VPC/RDS security, SQS/DLQ, Cognito pools, API Gateway/CloudFront, OCR Lambda and Tesseract/OpenCV layer, Aadhaar/PAN parsing, verification, SNS/SES infrastructure, CloudWatch, and deployment. Person A also coordinates the OCR worker's database and notification integration with Person B.

### Implementation objective

Deliver a deployable, least-privilege AWS stack and a working OCR worker that accepts the agreed SQS contract, processes documents, persists extraction/comparison outcomes using Person B's schema, sets the agreed status, and emits the correct existing notifications.

### Prerequisites and dependencies

- Inspect the current tree and the Person A, B, and project context documents.
- Obtain the AWS account/region and secure deployment access. Enable root MFA and use a scoped administrative identity for daily work; never use root credentials in development.
- Agree with Person B on migration/schema ownership, table/column names, transaction expectations, and the SQS message shape before the worker writes to RDS.
- Resolve the upload-to-SQS, status, comparison-field, notification, and upload-format contracts above.
- Obtain non-sensitive Cognito/S3/SQS/API values for wiring. Store secrets in Secrets Manager or encrypted Lambda configuration, not source control.

### Step-by-step implementation plan

#### A1. Inspect and establish the infrastructure baseline

- Inspect repository conventions, existing SAM files, AWS profiles, ignored files, and deployment scripts. Do not overwrite an existing stack.
- If no implementation exists, establish an infrastructure folder with a SAM template, parameter/config examples, deployment instructions, and separate OCR worker source/tests. Keep resource names and outputs consistent with the `pramana-*` names in context.
- Create a resource/output inventory that identifies which stack outputs Person B and C need.

**Files/modules:** SAM `template.yaml` (at the agreed repo location), SAM config/parameter examples, deployment README or the existing equivalent, OCR source and test modules.

**Test and acceptance:** SAM template validates locally; parameter files contain placeholders only; resource outputs expose the region, bucket names, queue URL, Cognito IDs, API URL, CloudFront domain/distribution, and notification configuration needed by teammates. No credentials appear in Git.

#### A2. Prove the OCR runtime before building the full stack

- Build a minimal Lambda layer for the selected Lambda architecture with Tesseract, `pytesseract`, OpenCV, and the required English/Hindi language data from the context.
- Confirm the packaged layer fits within the documented 250 MB unzipped limit and that the binary runs in the Lambda-compatible environment.
- Run representative, non-sensitive Aadhaar and PAN fixtures through preprocessing and OCR. Check raw output, parser inputs, execution duration, and Lambda-compatible filesystem use (`/tmp`).
- Keep the documented Rekognition DetectText fallback as a contingency only if the Tesseract POC fails; report the failure and required contract/cost changes before switching.

**Files/modules:** layer build recipe, layer contents, a small POC Lambda handler, sanitized OCR fixtures, POC instructions/results.

**Test and acceptance:** layer imports and invokes inside the target Lambda runtime; both fixture types produce raw text usable by the parser; size is within limit; timing and limitations are recorded. Do not proceed on an unverified assumption that local desktop OpenCV/Tesseract will run on Lambda.

#### A3. Implement SAM infrastructure in dependency order

1. Define parameters for region, stage, domain/origin settings, DB sizing, and sender configuration; provide safe demo defaults only where the context already defines them.
2. Provision VPC/private subnets/security groups and PostgreSQL RDS with `PubliclyAccessible: false`, 7-day backups, deletion protection, and a Secrets Manager credential. Allow database ingress from the application Lambdas only on port 5432.
3. Provision the private, versioned, SSE-S3 document bucket with all public access blocked and the agreed CORS origin/methods for presigned PUT. Use bucket policies/IAM roles limited to this bucket. Add the documented access-log destination if part of the deployment environment.
4. Provision the frontend S3 bucket as private and serve it through CloudFront with OAC, consistent with Person A's detailed bucket security section and the project architecture. Do not deploy a public S3 website endpoint.
5. Provision the OCR queue and DLQ with the documented visibility, retention, retry, batch size 1, and concurrency limit 5. Wire only the selected enqueue path from the contract checkpoint.
6. Provision customer and reviewer Cognito user pools and app clients with the documented password rules, customer MFA setting, reviewer MFA recommendation, reviewer self-sign-up disabled, and token durations.
7. Provision the Tesseract/OpenCV layer, OCR worker Lambda, FastAPI Lambda integration point, API Gateway HTTP API, Cognito authorizer for protected routes, CloudFront, SNS/SES configuration, CloudWatch log groups/alarms/dashboard, and Secrets Manager values.
8. Give each Lambda its own execution role with least-privilege access to only the resources it needs. Keep the OCR role limited to its bucket/queue/database/notification access and backend role limited to the backend's resources.

**Files/modules:** SAM resource definitions, IAM policies, security-group rules, S3 bucket policies/CORS, CloudFront OAC config, queue/DLQ config, Cognito config, secrets/env parameter references, outputs.

**Test and acceptance:** run SAM/template lint or validation after each resource group; inspect the generated change set before deployment; verify public access is blocked on documents and frontend bucket; verify RDS is private and only Lambda security groups can reach it; verify API public/protected route configuration; test queue retry/DLQ settings and CORS with the configured frontend origin. Use deployed smoke checks for security properties that local validation cannot prove.

#### A4. Implement the OCR worker and domain processing

- Keep processing modules small and independently testable: SQS handler, S3 download/temporary-file handling, image/PDF handling as agreed, OpenCV preprocessing, Tesseract invocation, Aadhaar parser, PAN parser, normalization, verification rules, database persistence adapter, and notification adapter.
- Validate incoming SQS messages. Reject unsupported document types and malformed messages in a way compatible with SQS retry/DLQ behavior; never mark an attempt complete before persistence succeeds.
- Preprocess images using the documented grayscale, denoise, threshold and deskew steps where appropriate. Run Tesseract with the configured language data and page segmentation mode from the context.
- Parse Aadhaar name, DOB, gender, number and address as described; parse PAN name, father's name, DOB and identifier as described. Normalize names, dates, and gender before comparison. Do not expose or log full document contents or identity numbers.
- Compare only the fields set by the shared contract. Persist one extracted-field row per extracted field, one comparison row per compared field, attempt/case status, completion time, system decision when auto-verified, and system audit event using Person B's agreed schema.
- On full required-field match, store `AUTO_VERIFIED`; on mismatch or missing/unreliable required data, use the agreed review state. Preserve the original attempt and never overwrite prior attempt results.
- Delete/acknowledge an SQS message only after all required processing/persistence succeeds. Allow configured retries and eventual DLQ routing on failure.

**Files/modules:** OCR handler, preprocessing, text extraction, parsers, normalization/verification, RDS repository adapter, worker configuration, unit and worker integration tests.

**Test and acceptance:** unit tests cover clean and noisy fixtures, field extraction, date/name normalization, missing/invalid values, Aadhaar/PAN field rules, exact-match and mismatch decisions, PDF behavior if retained, database write failures, duplicate delivery, and malformed queue messages. A worker integration test verifies SQS input through RDS writes and final status. A failed write leaves the message retryable; a successful job creates exactly one logical result.

#### A5. Integrate notifications, monitoring, and alarms

- Provision SNS topic/permissions and SES sender configuration/templates appropriate to the context and current demo account state. Document SES sandbox verification requirements and the India SMS/DLT limitations noted in Person A's context.
- Coordinate with Person B on the notification module/package interface and invocation ownership. Send SMS/email for each existing event only once. Rejection SMS remains generic; detailed mismatch values remain portal-only.
- Add CloudWatch logs for backend/OCR/RDS, metrics and alarms for DLQ depth, Lambda failures, RDS CPU, and API 5xx; build the documented throughput/error/queue/database dashboard.
- Ensure logs include correlation identifiers and status without full OCR text, document bytes, passwords, tokens, or full identity numbers.

**Test and acceptance:** notification unit tests use mocked clients and assert destination/template selection and failure handling; deployed tests use verified sandbox recipients and a safe test number when available. Confirm alarm metrics and log groups are created and a test DLQ message can trigger the expected alarm.

#### A6. Deploy and hand off

- Deploy the stack in dependency order with `sam deploy`; run migrations only when Person B supplies the reviewed migration and has coordinated the database run.
- Provide Person B the DB endpoint/name/port, Cognito pool/client IDs, document bucket, queue URL and message contract, SNS/SES config, layer ARN, region, secret name/permissions, API URL, and log locations through the agreed secure channel.
- Provide Person C the API URL, CloudFront URL/distribution, frontend bucket, customer/reviewer public Cognito configuration, region, and CORS origin details.
- Record deployed resource identifiers and verification evidence in a handoff note without publishing secrets.

**Final verification and acceptance:** clean deployment succeeds; API health route and Cognito-protected route behavior are correct; presigned upload and private bucket access behave as expected; queue retry and DLQ route work; OCR worker completes a sanitized end-to-end test; RDS remains private; alarms/logs are present; all outputs match the shared contract.

### Integration requirements and checkpoints

- **Checkpoint A/B — before worker database writes:** Person B reviews schema/migration and agrees exact columns, enum values, relationships, transaction behavior, and whether worker persistence uses shared models or a stable SQL contract. Run a schema compatibility test against a migrated test database.
- **Checkpoint A/B/C — before upload deployment:** agree trigger path, presigned key shape, content types, SQS payload, status transitions, and one-job-per-attempt behavior. Run an upload-to-queue contract test.
- **Checkpoint A/B — notifications:** Person B's service interface must be importable in both the API and worker deployment packages, or an already-existing equivalent must be used. Test notification ownership per event.
- **Checkpoint A/C — deployment:** verify CloudFront static routes, public API origin/CORS, frontend environment values, and Cognito public config using the actual exported build.

### Handoff/completion requirements

- Infrastructure source, layer build process, OCR code/tests, deployment/runbook, environment-variable names, migration coordination steps, resource outputs, and known AWS account/demo constraints.
- Evidence of validation and deployed smoke checks; clear distinction between mocked/local checks and AWS-verified checks.
- No uncommitted secrets, temporary documents, unrelated changes, or undocumented manual resource dependencies.

---
