# Pramāṇa — Person A / Person B Work Split

**Status:** Working ownership split for A/B coordination

**Updated:** 2026-10-29

## Purpose

This document assigns backend-related AWS resource work to Person B so B can
continue while Person A builds the shared AWS foundation and OCR worker. It
clarifies and redistributes overlapping A/B assignments; it does not change
Person C's work or any teammate's AWS access. Use this as the working A/B
ownership split, and confirm the stack boundary together before provisioning.

At the time of writing, no AWS resources have been deployed. The existing SAM
template contains only the initial storage, CloudFront, and OCR queue/DLQ
foundation. Use infrastructure as code and integrate each component once; do
not create duplicate resources manually.

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

## Shared decisions required before integration

Record these decisions in the shared contract sections of the individual plans
before wiring the backend and worker together:

1. Confirm a single upload-to-queue path. The current proposal is
   `POST /kyc/submit` enqueues the job and no S3 event also enqueues it.
2. Align the backend producer with the standard queue defined in SAM; settle the
   exact message fields, including how `content_type` reaches the worker.
3. Define attempt-ID allocation, abandoned upload handling, duplicate submit
   behavior, and the recovery boundary if the database commit or SQS send fails.
4. Agree separate case and attempt status values, including re-upload mapping,
   canonical field names/date formats, and whether `match_percentage` is stored.
5. Confirm which component sends each notification and whether SMS is sent
   directly to a phone number or through the configured SNS topic.

Until these are settled, keep the worker/API integration behind local contract
tests or mocks; do not enable both enqueue paths.

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
