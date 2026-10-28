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
| Attempt and object-key lifecycle | `POST /kyc/upload-url` is called before `POST /kyc/submit`, but the documented S3 key includes an `attempt_id`; the upload-url request/response does not define how that ID is allocated, while submit is described as creating the attempt. | Agree when the attempt ID is allocated and when case/attempt/document rows become persistent. Test URL creation, abandoned upload, repeated URL request, successful submit, and that the queued message references the exact uploaded object and attempt. |
| Database/SQS failure boundary | The API writes PostgreSQL state and sends an SQS message, but the context does not define their ordering or recovery if one succeeds and the other fails. | Define commit/send ordering and compensation using the assigned DB/SQS components; an accepted attempt must not remain falsely PROCESSING with no job, and a job must not reference missing data. Test DB failure, SQS failure, and retry/redelivery. |
| KYC status vocabulary | Docs use `REVIEW_REQUIRED`, `REUPLOAD_PENDING`, and `REUPLOAD_REQUESTED` in different places. `REVIEW_REQUIRED` appears in API/attempt examples but is missing from the frontend `KYCStatus` union and the project-level case-status table. | Agree on persisted case statuses, attempt statuses, and API-visible statuses separately; map them explicitly. Update backend enums/schemas and frontend types/badges together. Test each allowed transition and reject unknown values. |
| Authentication entry points | Person B defines `/auth/register`, `/auth/confirm`, `/auth/login`, `/auth/refresh`, `/auth/logout`; Person C's API client includes register/login, while its page notes also call Amplify `signIn()`/`signUp()` directly. | Select one consistent frontend-to-Cognito flow using the already-defined routes and Amplify responsibilities. Ensure registration confirmation, login, refresh, logout, and bearer-token attachment have one owner each. Verify customer and reviewer tokens against their respective pools and clients. |
| Cognito frontend configuration | Person B owns Cognito setup and provides separate customer/reviewer pool and client configuration; Person C shows a single pool ID/client ID in frontend environment variables. | Person B defines and provisions the customer and reviewer Cognito configuration; Person C consumes the public IDs for both portals. Person A wires the resulting pool/client IDs into API Gateway authorizers. Verify cross-pool access is denied and do not expose secrets in `NEXT_PUBLIC_*` variables. |
| Reviewer sign-in entry | The reviewer portal requires authenticated reviewer access, but Person C's pages list one `/login` and do not specify how it selects the reviewer pool. | Agree whether the existing login page has a reviewer sign-in mode or the reviewer portal has its own login route. Keep reviewer self-registration disabled. Test customer and reviewer sign-in against the correct pool. |
| API public routes and authorizers | Person A says only `/auth/register` and `/auth/login` are unauthenticated; Person B marks `/auth/confirm` and `/auth/refresh` unauthenticated too and uses separate Cognito pools. | Define the exact route table: registration, confirmation, login, and refresh are public as required by B's flow; logout and customer/reviewer APIs require auth. For an HTTP API JWT authorizer, configure the correct issuer/client audience per pool and attach the matching authorizer to protected routes, following [AWS HTTP API JWT authorizer configuration](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html). Verify both pools, the public route list, and unauthorized access. |
| Frontend bucket policy | Person A's SAM resource list says frontend bucket public-read/static website; its detailed S3 section says private, CloudFront OAC, and no website endpoint. The project architecture also specifies CloudFront + S3. | Use the detailed security configuration: private bucket behind CloudFront OAC, with direct public S3 reads denied. Test both CloudFront access and direct bucket denial. |
| Notification ownership and target | Person A owns AWS SNS/SES resources and describes worker notifications; Person B provides a notification service that Person A imports, while also owning reviewer decisions. The examples differ between publishing to an SNS topic and publishing directly to a phone number. | Agree who invokes the shared notification code for each existing event (document submission, automated result, reviewer decision, and re-upload), how it is packaged for both Lambdas, and whether SMS uses the configured topic or direct phone delivery. Test that ordinary duplicate processing does not cause duplicate logical sends. Record the result of each send attempt; because provider delivery and database writes are not one atomic transaction, document the ambiguous crash boundary and do not claim strict exactly-once delivery. Preserve generic rejection SMS and portal-only rejection detail. |
| Canonical field names and formats | Person A's parser examples emit `dob`; Person B's schema and API use `date_of_birth`, while frontend comparisons use `field` and the database column is `field_name`. Dates appear in both `YYYY-MM-DD` and `DD/MM/YYYY` examples, and registered gender values differ from Aadhaar OCR labels. | Agree one canonical field-name/value format and explicit adapter mappings across parser, DB, API and UI. Preserve raw OCR values separately from normalized values. Test name/date/gender/address mapping and display labels end-to-end. |
| Comparison fields, score, and match rule | Aadhaar address is described as optional/lower-weight in Person A's notes; other examples imply all compared fields are required for 100% auto-verification. Person A's verifier returns `match_percentage`, but the database/API examples do not define where that score is stored or exposed. PAN number is stored but not compared. | Record the exact compared/required field list, missing-field behavior, and whether the calculated match percentage is persisted or returned. Keep Aadhaar/PAN comparison fields as documented and test exact 100% auto-verify and mismatch-to-review behavior. Do not invent a new UI score if no current contract calls for one. |
| Static frontend routing | Person C specifies S3/CloudFront static export and also shows Next middleware plus a dynamic `/reviewer/cases/[caseId]` page. In Next.js 14 App Router static export, middleware is unsupported and dynamic routes need build-time `generateStaticParams`; case IDs are created at runtime ([Next.js 14 static export docs](https://nextjs.org/docs/14/app/building-your-application/deploying/static-exports)). | Keep the assigned static hosting target. Use browser-side route guards and a static case-detail page that reads the case ID from a query parameter (for example, `/reviewer/cases/detail/?caseId=...`), while the backend detail API remains keyed by case ID. Verify direct navigation/refresh on CloudFront. The backend remains the authorization boundary. |
| Supported upload formats | Person C accepts JPEG, PNG, and PDF; Person A's sample OpenCV path reads raster images and does not define PDF decoding. | Preserve JPEG, PNG, and PDF support as documented. Implement Lambda-compatible PDF page rendering in Person A's OCR worker before preprocessing, and verify package size/runtime with the layer POC. Test each format through upload, queue, OCR, and result display; do not silently narrow the accepted formats. |

When no person can settle a contract from the current context, record the exact question and its blocked integration step for the project owner. Continue unrelated work with a mock of the agreed interface; do not invent a new behavior.

---

## Person A

### Existing assigned responsibility

Own the AWS backbone and deployment: account/IAM setup, SAM infrastructure, private document and frontend storage, VPC/RDS security, SQS/DLQ, API Gateway/CloudFront, OCR Lambda and Tesseract/OpenCV layer, Aadhaar/PAN parsing, verification, SNS/SES infrastructure, CloudWatch, and deployment. Cognito user-pool and app-client setup is owned by Person B; Person A wires B's Cognito outputs into API Gateway authorizers and the SAM deployment. Person A also coordinates the OCR worker's database and notification integration with Person B.

### Implementation objective

Deliver a deployable, least-privilege AWS stack and a working OCR worker that accepts the agreed SQS contract, processes documents, persists extraction/comparison outcomes using Person B's schema, sets the agreed status, and emits the correct existing notifications.

### Prerequisites and dependencies

- Inspect the current tree and the Person A, B, and project context documents.
- Obtain the AWS account/region and secure deployment access. Enable root MFA and use a scoped administrative identity for daily work; never use root credentials in development.
- Agree with Person B on migration/schema ownership, table/column names, transaction expectations, and the SQS message shape before the worker writes to RDS.
- Resolve the upload-to-SQS, status, comparison-field, notification, and upload-format contracts above.
- Obtain Person B's Cognito pool/client configuration plus the required S3/SQS/API values for infrastructure wiring. Store secrets in Secrets Manager or encrypted Lambda configuration, not source control.

### Step-by-step implementation plan

#### A1. Inspect and establish the infrastructure baseline

- Inspect repository conventions, existing SAM files, AWS profiles, ignored files, and deployment scripts. Do not overwrite an existing stack.
- If no implementation exists, establish an infrastructure folder with a SAM template, parameter/config examples, deployment instructions, and separate OCR worker source/tests. Keep resource names and outputs consistent with the `pramana-*` names in context.
- Set up root MFA, use a separate day-to-day admin identity, and create the assigned IAM identities/access for Persons B and C with scoped permissions to this project's named resources. Never distribute root credentials or grant broad administrator permissions to team members.
- Create a resource/output inventory for Person B and C, including the Cognito outputs supplied by Person B.

**Files/modules:** SAM `template.yaml` (at the agreed repo location), SAM config/parameter examples, deployment README or the existing equivalent, OCR source and test modules.

**Test and acceptance:** SAM template validates locally; parameter files contain placeholders only; IAM policies are reviewed for least privilege; resource outputs expose the region, bucket names, queue URL, Cognito IDs, API URL, CloudFront domain/distribution, and notification configuration needed by teammates. No credentials appear in Git.

#### A2. Prove the OCR runtime before building the full stack

- Build a minimal Lambda layer for the selected Lambda architecture with Tesseract, `pytesseract`, OpenCV, and the required English/Hindi language data from the context.
- Confirm the packaged layer fits within the documented 250 MB unzipped limit and that the binary runs in the Lambda-compatible environment.
- Run representative, non-sensitive Aadhaar and PAN fixtures through preprocessing and OCR. Check raw output, parser inputs, execution duration, and Lambda-compatible filesystem use (`/tmp`).
- Keep the documented Rekognition DetectText fallback as a contingency only if the Tesseract POC fails; report the failure and required contract/cost changes before switching.

**Files/modules:** layer build recipe, layer contents, a small POC Lambda handler, sanitized OCR fixtures, POC instructions/results.

**Test and acceptance:** layer imports and invokes inside the target Lambda runtime; both fixture types produce raw text usable by the parser; size is within limit; record timing against Person A's documented target of under 30 seconds and the worker timeout target of 5 minutes, plus limitations. Do not proceed on an unverified assumption that local desktop OpenCV/Tesseract will run on Lambda.

#### A3. Implement SAM infrastructure in dependency order

1. Define parameters for region, stage, domain/origin settings, DB sizing, and sender configuration; provide safe demo defaults only where the context already defines them.
2. Provision VPC/private subnets/security groups and PostgreSQL RDS using the documented `t3.micro` demo target where available, with `PubliclyAccessible: false`, 7-day backups, deletion protection, and a Secrets Manager credential that is manually rotated for the demo as specified. Allow database ingress from the application Lambdas only on port 5432. Ensure private-subnet Lambdas can reach the AWS services they need (S3, SQS, Secrets Manager, Cognito APIs/JWKS, logs, and notification services) through the least-cost appropriate endpoints/egress path; verify connectivity without making RDS public.
3. Provision the private, versioned, SSE-S3 document bucket with all public access blocked and the agreed CORS origin/methods for presigned PUT. Use bucket policies/IAM roles limited to this bucket. Enable the documented document-bucket access logging to a separate private log bucket.
4. Provision the frontend S3 bucket as private and serve it through CloudFront with OAC, consistent with Person A's detailed bucket security section and the project architecture. Do not deploy a public S3 website endpoint.
5. Provision the standard OCR queue and DLQ with 300-second visibility timeout, 4-day main-queue retention, 14-day DLQ retention, redrive after 3 failed receives, batch size 1, and maximum worker concurrency 5. Wire only the selected enqueue path from the contract checkpoint.
6. Consume the customer and reviewer Cognito user pools/app clients configured by Person B. Wire the matching pool issuers and client audiences into API Gateway route-level authorizers; keep only the agreed auth endpoints public.
7. Provision the Tesseract/OpenCV layer, OCR worker Lambda, FastAPI Lambda integration point, API Gateway HTTP API, CloudFront, SNS/SES configuration, CloudWatch log groups/alarms/dashboard, and Secrets Manager values. Configure throttling to the documented 50 requests/second steady and 100 requests/second burst limits.
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

- Provision SNS topic/permissions and SES sender configuration/templates appropriate to the context and current demo account state. Document SES sandbox verification requirements and the India SMS/DLT limitations noted in Person A's context.
- Coordinate with Person B on the notification module/package interface and invocation ownership. Send the configured notification attempt for each existing event (document submitted, automated result, reviewer decision, re-upload) and deduplicate ordinary retries. Rejection SMS remains generic; detailed mismatch values remain portal-only.
- Add the documented CloudWatch log groups, metric filters, alarms, and dashboard. Configure alarms at the stated thresholds: any DLQ message, more than 5 Lambda errors in 5 minutes, RDS CPU above 80% for 5 minutes, and more than 10 API 5xx errors in 5 minutes. CloudTrail remains optional/recommended as the source context states.
- Ensure logs include correlation identifiers and status without full OCR text, document bytes, passwords, tokens, or full identity numbers.

**Test and acceptance:** notification unit tests use mocked clients and assert destination/template selection and failure handling; deployed tests use verified sandbox recipients and a safe test number when available. Confirm alarm metrics and log groups are created and a test DLQ message can trigger the expected alarm.

#### A6. Deploy and hand off

- Deploy the stack in dependency order with `sam deploy`; run migrations only when Person B supplies the reviewed migration and has coordinated the database run.
- Provide Person B the DB endpoint/name/port, document bucket, queue URL and message contract, SNS/SES config, layer ARN, region, secret name/permissions, API URL, and log locations through the agreed secure channel.
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
