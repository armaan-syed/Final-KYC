# Pramāṇa — Person A / Person B Work Split

**Status:** Working ownership split for A/B coordination

**Updated:** 2026-10-29

## Purpose

This document assigns backend-related AWS resource work to Person B so B can
continue while Person A builds the shared AWS foundation and OCR worker. It
clarifies and redistributes overlapping A/B assignments; it does not change
Person C's work or any teammate's AWS access. Use this as the working A/B
ownership split, and confirm the stack boundary together before provisioning.

As of 2026-10-29, the A-owned foundation stack is deployed in `us-east-1`.
Person B can use its VPC, two private subnets, and security-group IDs below to
provision private RDS now. NAT and public routing have been removed at Person A's
instruction. The stack retains the private S3 buckets, S3 gateway endpoint,
standard OCR queue/DLQ, alarms, dashboard, and shared layer. CloudFront and the
OCR worker remain disabled. Private Lambdas will need approved interface VPC
endpoints before their AWS SDK calls can work; no NAT or interface endpoints are
currently deployed. Use infrastructure as code and do not create duplicate
resources manually.

## Ownership

| Area | Person A owns | Person B owns |
|---|---|---|
| Shared networking | VPC, private subnets, routing/egress, and shared network/security-group foundation. Provide the subnet and network references needed by B's private services. | Specify the backend and database connectivity needs, including which function security groups need PostgreSQL access. |
| Document and frontend storage | Private document and access-log buckets, upload CORS, frontend bucket, CloudFront OAC, and their IAM boundaries. | Backend presigned upload/download integration against the bucket and the agreed object-key lifecycle. |
| Queue and OCR | Standard SQS OCR queue and DLQ, worker event-source mapping, OCR Lambda, Lambda layer, worker retry/idempotency behavior, OCR and verification pipeline. | API-side SQS producer, payload validation/schema, and the backend permission required to send one job per accepted attempt. |
| Database | Provide the VPC, private subnets, and network/security-group references; implement the worker's persistence adapter after the schema checkpoint. | Own the PostgreSQL RDS instance/database configuration and its Secrets Manager secret inside the VPC provided by A. Own models, Alembic migrations, schema verification, and backend database access. |
| Cognito | Consume B's pool/client outputs in the API Gateway authorizer configuration and deployment parameters. | Create and configure customer/reviewer user pools and app clients; disable reviewer self-registration; provide pool IDs, app client IDs, issuers, and token/authorizer requirements to A and public configuration to C. |
| Backend API | Provide shared infrastructure references and integrate the backend component with the shared stack. | Own FastAPI, backend Lambda configuration, backend API Gateway routes/integration, API-specific IAM permissions and environment settings, auth, customer/KYC/reviewer services, and API tests. |
| Notifications | Integrate the worker with B's shared notification interface and coordinate worker permissions/configuration. | Own the shared notification module, direct-phone SNS SMS and SES sender identity/configuration, templates, and tests. A separate customer SNS topic is not used by the agreed direct-phone contract. |
| Stack integration and release | Own the shared/root SAM template and foundation stack; review cross-stack dependencies, full-stack cost and change sets, and coordinate the release. | Own and provision the B-specific backend/database/notification component stack using A's network outputs. Supply its outputs to A and C. No B-owned stack is deployed until A has reviewed and approved its change set. |

## Handoffs

### Person A provides to Person B

- VPC: `vpc-0f16fa3dea85f7b0d`.
- Private subnet A: `subnet-0e45971a48d73a18a` (`us-east-1a`); subnet B:
  `subnet-03c8032601117f445` (`us-east-1b`).
- Database security group: `sg-02235e74a0e910c37`; PostgreSQL ingress on 5432
  is limited to the backend SG `sg-02823dd2442632bed` and worker SG
  `sg-0751ba5b887acb41c`.
- Document bucket: `pramana-dev-foundation-documentbucket-r77xgfetn3cj`.
- Standard OCR queue URL:
  `https://sqs.us-east-1.amazonaws.com/682197558335/pramana-dev-foundation-OCRQueue-LrTO9SM80mE2`;
  ARN: `arn:aws:sqs:us-east-1:682197558335:pramana-dev-foundation-OCRQueue-LrTO9SM80mE2`.
- Standard queue message schema and one-producer rule remain as described below.
- AWS region: `us-east-1`.
- The reviewed integration/deployment path for B's backend, database, and
  notification resource definitions.

Person B's private RDS database is deployed from these outputs. Do not expect
backend/worker AWS API calls from the private subnets to work until the team
chooses and deploys interface endpoints (or later approves another egress path).

### Person B provides to Person A and Person C

- Customer pool `us-east-1_8Q9onMEne`, client `1rtg8t1nbggjsf2i0d8g7jqqov`;
  reviewer pool `us-east-1_IQzz0ktCu`, client `5fh52722t9o0le48pieqavtcv0`.
  Issuers and public client configuration are in `../backend/COGNITO_OUTPUTS.md`.
- RDS endpoint `pramana-dev-database-db.citogy2m6wxr.us-east-1.rds.amazonaws.com`,
  port `5432`, database `pramana_kyc`, and secret ARN
  `arn:aws:secretsmanager:us-east-1:682197558335:secret:rds!db-3d281b6c-5013-4ee5-abc6-2970ac631d50-Cb3oaQ`.
  The secret value is never written here, source-controlled, or shared in chat.
- Backend API Gateway URL and backend Lambda configuration/permission needs.
- Shared notifications layer ARN:
  `arn:aws:lambda:us-east-1:682197558335:layer:pramana-dev-shared-notifications:2`.
- Customer SMS uses direct phone delivery through SNS; no customer SNS topic is
  used. SES sender identity and API URL remain pending.
- Reviewed Alembic migrations, schema/status/message contract, and test evidence.

Person A's network, bucket, and queue identifiers and Person B's RDS/Cognito
outputs are now available above. The RDS master password remains only in the
RDS-managed Secrets Manager secret. SES sender identity, API URL, and API/worker
runtime connectivity remain pending. Use coordinated SAM/CloudFormation stacks
or nested templates; do not create parallel copies of shared resources.

## Shared contract implementation baseline

The following A/B contract is implemented and locally tested in code. Person B should confirm it before deployment; recording it here does not claim a deployed integration.

1. **Queue:** `/kyc/submit` is the only producer and the queue is standard. No S3 notification is configured. The six fields are `kyc_attempt_id`, `kyc_case_id`, `customer_id`, `s3_bucket`, `s3_key`, and `document_type`. Object `ContentType` is read from S3.
2. **Attempt/key lifecycle:** `/kyc/upload-url` allocates and persists the attempt before upload; the server key is `documents/{customer_id}/{attempt_id}/{file_name}`. `/kyc/submit` persists the document row, commits, then enqueues. Abandoned attempts remain PROCESSING.
3. **Failure boundary:** commit-before-send ensures the worker sees committed data. The worker locks attempt/case rows, persists once, and ignores redelivery after a terminal processing result. There is no transactional outbox: failed SQS send after DB commit can leave PROCESSING until the client retries or an operator repairs it. Repeated S3/OCR failures can also reach the DLQ while the attempt remains `PROCESSING`; B/A/C need to agree on the reviewer/operator recovery transition. Person B must confirm whether to add an outbox or keep an explicit repair path.
4. **Statuses:** case states are `PENDING`, `PROCESSING`, `AUTO_VERIFIED`, `REVIEW_REQUIRED`, `APPROVED`, `REJECTED`, `REUPLOAD_PENDING`; attempt states are `PROCESSING`, `AUTO_VERIFIED`, `REVIEW_REQUIRED`, `APPROVED`, `REJECTED`, `REUPLOAD_REQUESTED`. Re-upload updates the existing attempt and case separately; the next upload creates a new attempt. Person C should align its status model.
5. **Comparison:** current code compares Aadhaar name, date of birth, and gender; PAN name and date of birth. Aadhaar/PAN identifiers and Aadhaar address are extracted and stored but not compared. Person A's source describes address as optional/lower-weight, but its confidence/weight rules are unspecified; B/A must agree before adding it. Missing required fields produce `REVIEW_REQUIRED`. Match percentage is written to audit JSON; B's schema has no score column. Tesseract word confidence (0–100) is stored per extracted field when tokens map reliably, otherwise `confidence` stays null.
6. **Notifications:** worker auto-verification uses the shared notification module to send generic SMS directly to the customer phone and SES email after commit. B's reviewer-decision path sends its existing notifications. The proposed B customer SNS topic is not used by current code; submit/re-upload notification ownership remains open. Provider delivery is best-effort and cannot be atomic with the DB transaction.
7. **Authentication:** B's FastAPI validates customer/reviewer Cognito ID tokens against their respective issuers and clients. Pool/client outputs are available. API Gateway authorizer wiring remains a coordination decision; the current B component uses FastAPI authorization behind a catch-all route.

The shared foundation stack is deployed with OCR worker and CloudFront disabled.
Person B's private RDS stack is now deployed; the Cognito pools pre-existed in
the account and have been configured for the API contract. The foundation has no
NAT or interface endpoints, so private Lambdas still cannot call Secrets
Manager, SQS, SNS, SES, or Cognito. SES identity and the backend API are not yet
deployed. See the [Person A plan](PERSON_A_IMPLEMENTATION_PLAN.md#aws-foundation-deployment-and-no-nat-update-2026-10-29)
for endpoint options/costs and the foundation change-set record.

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
