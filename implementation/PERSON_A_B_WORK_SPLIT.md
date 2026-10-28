# Pramāṇa — Person A / Person B Work Split

**Status:** Working ownership split for A/B coordination

**Updated:** 2026-10-29

## Purpose

This document assigns backend-related AWS resource work to Person B so B can
continue while Person A builds the shared AWS foundation and OCR worker. It
clarifies and redistributes overlapping A/B assignments; it does not change
Person C's work or any teammate's AWS access. Use this as the working A/B
ownership split, and confirm the stack boundary together before provisioning.

As of 2026-10-29, the shared foundation has a reviewed, unexecuted CloudFormation
change set. No application-stack resources have been deployed. SAM has created
its managed artifact bucket and uploaded artifacts for the review-only change
set. The source defines the shared VPC, private network, buckets, CloudFront
OAC, standard OCR queue and DLQ, conditional OCR worker/layers, alarms, and
dashboard. The worker remains disabled by default until Person B supplies its
database secret and SES sender identity. Use infrastructure as code and
integrate each component once; do not create duplicate resources manually.

## Ownership

| Area | Person A owns | Person B owns |
|---|---|---|
| Shared networking | VPC, private subnets, routing/egress, and shared network/security-group foundation. Provide the subnet and network references needed by B's private services. | Specify the backend and database connectivity needs, including which function security groups need PostgreSQL access. |
| Document and frontend storage | Private document and access-log buckets, upload CORS, frontend bucket, CloudFront OAC, and their IAM boundaries. | Backend presigned upload/download integration against the bucket and the agreed object-key lifecycle. |
| Queue and OCR | Standard SQS OCR queue and DLQ, worker event-source mapping, OCR Lambda, Lambda layer, worker retry/idempotency behavior, OCR and verification pipeline. | API-side SQS producer, payload validation/schema, and the backend permission required to send one job per accepted attempt. |
| Database | Provide the VPC, private subnets, and network/security-group references; implement the worker's persistence adapter after the schema checkpoint. | Own the PostgreSQL RDS instance/database configuration and its Secrets Manager secret inside the VPC provided by A. Own models, Alembic migrations, schema verification, and backend database access. |
| Cognito | Consume B's pool/client outputs in the API Gateway authorizer configuration and deployment parameters. | Create and configure customer/reviewer user pools and app clients; disable reviewer self-registration; provide pool IDs, app client IDs, issuers, and token/authorizer requirements to A and public configuration to C. |
| Backend API | Provide shared infrastructure references and integrate the backend component with the shared stack. | Own FastAPI, backend Lambda configuration, backend API Gateway routes/integration, API-specific IAM permissions and environment settings, auth, customer/KYC/reviewer services, and API tests. |
| Notifications | Integrate the worker with B's shared notification interface and coordinate worker permissions/configuration. | Own the notification module and SNS topic/SES sender identity and settings, templates, and tests. Provide resource definitions and outputs for integration. |
| Stack integration and release | Own the shared/root SAM template and foundation stack; review cross-stack dependencies, full-stack cost and change sets, and coordinate the release. | Own and provision the B-specific backend/database/notification component stack using A's network outputs. Supply its outputs to A and C. No B-owned stack is deployed until A has reviewed and approved its change set. |

## Handoffs

### Person A provides to Person B

- VPC ID, private subnet IDs, and the agreed security-group references once the
  network foundation is defined.
- Document bucket name and required access contract.
- Standard OCR queue URL/ARN and the agreed SQS message schema.
- AWS region: `us-east-1`.
- The reviewed integration/deployment path for B's backend, database, and
  notification resource definitions.

### Person B provides to Person A and Person C

- Customer/reviewer Cognito pool IDs, app client IDs, issuer URLs, and
  authorizer/token requirements; C receives only public configuration.
- RDS endpoint, port, database name, and Secrets Manager secret ARN after the
  database exists. Do not put the database password in this document, source
  control, or ordinary chat.
- Backend API Gateway URL and backend Lambda configuration/permission needs.
- SNS topic ARN, SES sender identity/configuration, and the notification module
  interface used by both the API and worker.
- Reviewed Alembic migrations, schema/status/message contract, and test evidence.

Resource identifiers and secret values are not available until the relevant
resources are created. Share secret values only through the agreed secure
mechanism; provide secret ARNs and non-secret connection metadata in handoff
notes. Use coordinated SAM/CloudFormation stacks or nested templates; do not
create parallel console-managed copies of resources already defined in code.

## Shared contract implementation baseline

The following A/B contract is implemented and locally tested in code. Person B should confirm it before deployment; recording it here does not claim a deployed integration.

1. **Queue:** `/kyc/submit` is the only producer and the queue is standard. No S3 notification is configured. The six fields are `kyc_attempt_id`, `kyc_case_id`, `customer_id`, `s3_bucket`, `s3_key`, and `document_type`. Object `ContentType` is read from S3.
2. **Attempt/key lifecycle:** `/kyc/upload-url` allocates and persists the attempt before upload; the server key is `documents/{customer_id}/{attempt_id}/{file_name}`. `/kyc/submit` persists the document row, commits, then enqueues. Abandoned attempts remain PROCESSING.
3. **Failure boundary:** commit-before-send ensures the worker sees committed data. The worker locks attempt/case rows, persists once, and ignores redelivery after a terminal processing result. There is no transactional outbox: failed SQS send after DB commit can leave PROCESSING until the client retries or an operator repairs it. Repeated S3/OCR failures can also reach the DLQ while the attempt remains `PROCESSING`; B/A/C need to agree on the reviewer/operator recovery transition. Person B must confirm whether to add an outbox or keep an explicit repair path.
4. **Statuses:** case states are `PENDING`, `PROCESSING`, `AUTO_VERIFIED`, `REVIEW_REQUIRED`, `APPROVED`, `REJECTED`, `REUPLOAD_PENDING`; attempt states are `PROCESSING`, `AUTO_VERIFIED`, `REVIEW_REQUIRED`, `APPROVED`, `REJECTED`, `REUPLOAD_REQUESTED`. Re-upload updates the existing attempt and case separately; the next upload creates a new attempt. Person C should align its status model.
5. **Comparison:** current code compares Aadhaar name, date of birth, and gender; PAN name and date of birth. Aadhaar/PAN identifiers and Aadhaar address are extracted and stored but not compared. Person A's source describes address as optional/lower-weight, but its confidence/weight rules are unspecified; B/A must agree before adding it. Missing required fields produce `REVIEW_REQUIRED`. Match percentage is written to audit JSON; B's schema has no score column. Tesseract word confidence (0–100) is stored per extracted field when tokens map reliably, otherwise `confidence` stays null.
6. **Notifications:** worker auto-verification uses the shared notification module to send generic SMS directly to the customer phone and SES email after commit. B's reviewer-decision path sends its existing notifications. The proposed B customer SNS topic is not used by current code; submit/re-upload notification ownership remains open. Provider delivery is best-effort and cannot be atomic with the DB transaction.
7. **Authentication:** B's FastAPI validates Cognito JWTs. Pool/client outputs and API Gateway authorizer configuration are not present. A's root SAM does not currently wire authorizers into B's separate REST API; settle this boundary with B when pools/API design are available.

No application S3, queue, database, Cognito, notification, or Lambda resources
are deployed from the project stack. The SAM deployment artifact bucket exists
outside that stack and holds staged artifacts. The review-only foundation change
set is `AVAILABLE` but unexecuted; it proposes 35 additions and no replacements
or deletions, with `EnableOCRWorker=false`. Its NAT gateway plus public IPv4
address would cost about `$36.50` per 730-hour month before data processing or
other usage. See the [Person A plan](PERSON_A_IMPLEMENTATION_PLAN.md#aws-review-only-foundation-change-set-2026-10-29)
for the change set ARN, resource scope, and review details. Person B and Person
C's existing AWS administrator access remains unchanged.

## Completion checkpoints

### Person B checkpoint

- Alembic upgrade succeeds against a clean local/test PostgreSQL database.
- Backend tests cover auth/role checks, upload/submit, failure recovery,
  reviewer decisions, status mapping, and notification behavior.
- Cognito outputs and the B-owned resource definitions are ready for stack
  integration.
- Backend runs locally or through SAM local with placeholders/mocks and is
  ready to use A's actual AWS outputs when they are available.

### Person A checkpoint

- Shared VPC/storage/queue foundation and OCR worker are defined and validated.
- Worker persistence and notification adapters match B's migration and agreed
  interfaces; queue retries do not create duplicate logical results.
- The combined SAM/CloudFormation change set is reviewed for dependencies,
  permissions, replacement/deletion effects, and cost before deployment.
- After deployment, A and B run the schema-to-worker and API-to-queue checks and
  provide verified outputs to C.

No resource is considered integrated merely because its template or source
file exists. Label local, mocked, and AWS-deployed verification separately.
