# Pramāṇa — Person A / Person B Work Split

**Updated:** 2026-10-29
**Canonical integration contract:** [`INTEGRATION_DECISIONS_2026-10-29.md`](INTEGRATION_DECISIONS_2026-10-29.md)

Person A selected the remaining cross-person decisions at the project owner's direction. The contract is binding for implementation; no design vote is pending.

## Current deployment snapshot

- A's `pramana-dev-foundation` is deployed in `us-east-1`; NAT is absent, OCR and CloudFront are disabled, and the free S3 gateway endpoint remains.
- B's private RDS instance and the customer/reviewer Cognito pools and clients exist. A's read-only check reached PostgreSQL over verified TLS and found `public` empty with no Alembic revision; B still needs to apply and verify the current migration.
- There is no deployed backend API/Lambda, OCR worker, verified SES sender, or CloudFront distribution. B has not supplied an API deployment change set for review.
- A's egress-only IPv6 path is deployed. Temporary private Lambda probes verified Secrets Manager, SQS, SNS, Cognito, SES, and PostgreSQL TLS connectivity without NAT or interface endpoints. The database probe ZIPs and Lambda function are gone; CloudFormation is still waiting for AWS to detach the Lambda-managed ENIs before removing its temporary role and log group.
- A reviewed B's authorization boundary and changed the local implementation to validate Cognito access tokens at FastAPI. This review and network path address the A-owned blockers B reported; B can proceed with migration and API deployment preparation.

## Ownership

| Area | Person A owns | Person B owns |
|---|---|---|
| Shared networking | VPC, private subnets, IPv6 egress, shared network/security groups, and database ingress boundary. | State backend/database connectivity needs. Do not add NAT or paid interface endpoints without cost review. |
| Document and frontend storage | Private document/access-log buckets, upload CORS, frontend bucket, CloudFront OAC, and boundaries. | Presigned upload/download integration and object-key lifecycle. |
| Queue and OCR | Standard SQS/DLQ, worker, OCR layer, retry/idempotency, OCR and verification pipeline. | `/kyc/submit` SQS producer, schema/payload validation, and send permission. |
| Database | Provide network/security-group references and implement worker persistence against the agreed schema. | RDS/database/secret, models, Alembic migrations, catalog verification, and API database access. |
| Cognito and API authorization | Verify private endpoint connectivity and document the FastAPI authorization boundary. | Own user pools/clients, API and auth/business logic. FastAPI checks the correct Cognito pool/client; API Gateway remains a proxy without a second authorizer. |
| Notifications | Integrate worker with B's shared notification module and its permissions/configuration. | Own shared notification module, reviewer-decision notifications, direct-phone SNS SMS, SES sender identity/configuration, and templates. No customer SNS topic is used. |
| Stack integration and release | Own shared/root SAM foundation, review cross-stack dependencies and costs, and review B's actual change set before execution. | Own B-specific database/API resources and supply their deployment outputs. No duplicate shared network/API resources. |

## A-to-B handoff

- Region/account: `us-east-1`, account `682197558335`.
- VPC: `vpc-0f16fa3dea85f7b0d`; IPv6 prefix: `2600:1f18:4020:8800::/56`.
- Private subnets: `subnet-0e45971a48d73a18a` (`us-east-1a`, `2600:1f18:4020:8800::/64`) and `subnet-03c8032601117f445` (`us-east-1b`, `2600:1f18:4020:8801::/64`).
- Egress-only gateway `eigw-0e03c52bb1008d130`; both private route tables have active `::/0` routes to it. Backend and worker Lambda security groups limit IPv6 egress to TCP 443; existing IPv4 default egress has no public IPv4 route. No NAT or interface endpoints are deployed. Outbound data transfer may be billed.
- Database SG: `sg-02235e74a0e910c37`; backend SG: `sg-02823dd2442632bed`; worker SG: `sg-0751ba5b887acb41c`. Database ingress is TCP 5432 only from backend and worker SGs.
- Document bucket: `pramana-dev-foundation-documentbucket-r77xgfetn3cj`.
- OCR queue URL: `https://sqs.us-east-1.amazonaws.com/682197558335/pramana-dev-foundation-OCRQueue-LrTO9SM80mE2`; ARN: `arn:aws:sqs:us-east-1:682197558335:pramana-dev-foundation-OCRQueue-LrTO9SM80mE2`.
- Shared notification/RDS CA layer ARN: `arn:aws:lambda:us-east-1:682197558335:layer:pramana-dev-shared-notifications:2`.
- On 2026-10-29, temporary read-only Lambda probes in the shared private subnets successfully called Secrets Manager, SQS, SNS, both Cognito pools, and SES, then retrieved the RDS-managed credentials and connected to PostgreSQL with `sslmode=verify-full`. RDS is reachable from the backend SG; no tables or Alembic revision exist yet. B's backend template sets `Ipv6AllowedForDualStack: true` and uses dual-stack endpoints for SQS/SNS/SES.

## B-to-A/C handoff

- Customer Cognito pool `us-east-1_8Q9onMEne`, client `1rtg8t1nbggjsf2i0d8g7jqqov`; reviewer pool `us-east-1_IQzz0ktCu`, client `5fh52722t9o0le48pieqavtcv0`. More detail: [`../backend/COGNITO_OUTPUTS.md`](../backend/COGNITO_OUTPUTS.md). These are public identifiers, not secrets.
- RDS endpoint `pramana-dev-database-db.citogy2m6wxr.us-east-1.rds.amazonaws.com`, port `5432`, database `pramana_kyc`; secret ARN `arn:aws:secretsmanager:us-east-1:682197558335:secret:rds!db-3d281b6c-5013-4ee5-abc6-2970ac631d50-Cb3oaQ`. Never publish the secret value.
- Pending: applied and verified live Alembic migration/catalog, backend API URL/Lambda, SES sender identity and production access, SNS SMS service subscription/spend-limit check, and reviewed B-owned API change set. The live account currently has no SES identities, and the SMS attributes call fails because the account has no subscription for that service.
- B reports the customer pool's required custom attributes are configured; `gender` is the standard Cognito attribute. Live read shows SRP is enabled on both clients; customer password auth is also enabled, reviewer password auth is not. The frontend uses Amplify SRP.

## Migration runner verification for Person B (2026-10-29)

- A's read-only probe confirmed the private Lambda path can retrieve the RDS-managed secret and connect to `pramana-dev-database-db.citogy2m6wxr.us-east-1.rds.amazonaws.com:5432/pramana_kyc` using the existing backend SG and the shared RDS CA. The secret contains only `username` and `password`; pass the RDS host and database name separately. The query observed `alembic_revision=null` and no public tables. It performed no writes.
- Further CloudTrail review of B's later retry shows `AWSLambdaVPCAccessExecutionRole` was attached before `CreateFunction`, the Lambda role was assumed successfully, and EC2 `CreateNetworkInterface` dry-run checks in both subnets returned `Client.DryRunOperation`. The CreateFunction event was at `2026-10-29 07:45:27Z`, request ID `78a8510e-d1bd-4570-9923-4fe1b88a304c`. These are permission checks only: no actual ENI-create event followed. No explicit denied API action identifying the cause was retained. The function was deleted before its failure state could be captured, so the reported `InsufficientRolePermissions` cannot be attributed to a specific missing IAM action from the available evidence.
- A reproduced the failure on 2026-10-29 using the same Lambda name, private subnets, backend SG, dual-stack setting, shared CA layer, a secret-scoped `GetSecretValue` policy, and AWS managed VPC execution policy v3 attached before creation. Lambda reached `Pending` then `Failed`; `StateReasonCode=InsufficientRolePermissions`, `StateReason="The function's execution role doesn't have permission to perform this operation."`, and all `LastUpdateStatus*` fields were null. IAM simulation returned `allowed` for all six EC2 actions in AWS's Lambda VPC checklist and the three log actions; the `pramana-admin` caller also simulated `allowed` for all four VPC resource-description actions. The managed policy v3 contains the six documented EC2 actions on `*`. CloudTrail lookup returned no matching EC2 denial for this retry. This still does not identify an actual missing permission, so no IAM policy was widened.
- Do not broaden the role policy based on that message alone. For another diagnostic retry, preserve the function and role long enough to immediately capture `get-function-configuration` fields `State`, `StateReasonCode`, `StateReason`, `LastUpdateStatus`, `LastUpdateStatusReasonCode`, and `LastUpdateStatusReason`, along with the CreateFunction request ID and timestamp. If those details still do not identify an explicit denied action, give the evidence to AWS Support before changing IAM. [Lambda VPC guidance](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html) lists the required ENI actions and the `AWSLambdaVPCAccessExecutionRole` managed policy; [EC2 DryRunOperation](https://docs.aws.amazon.com/ec2/latest/devguide/errors-overview.html) means the checked request was authorized, not that every Lambda networking operation was proven.
- This resolves A's network-path question, not B's runner provisioning issue. The checked-in B model and initial migration were corrected to SQLAlchemy/PostgreSQL `DATE`; a focused schema-type test and a reproducible package builder/handler are in source at commit `5cc4a8c`. The B-provided Windows ZIP is not present in this checkout. A fresh Linux x86_64/Python 3.11 package was built from that source at `/tmp/pramana-db-migration-runner/migration-runner.zip` (35,819,850 bytes; SHA-256 `6b3169724ef31a5cd4208a14ee6eccdb7e9a33be8f3a4b16f80d9b60acb26a8d`). It was not invoked: the Lambda failed before becoming Active. The failed function and role were removed after capturing the state reason; no ENI or log group remained, and no migration/database write occurred. The package has not run in an actual Lambda runtime. An independent one-shot retry is still blocked pending AWS Support's explanation; if it becomes Active, invoke it exactly once and verify revision `001_initial_schema`, all nine application tables, and `customers.date_of_birth` type `date` in that same invocation.
- Current teardown check: the two Lambda-managed ENIs from A's database connectivity probe are detached and `available`, but CloudFormation still reports `pramana-dev-a-db-connectivity-probe` as `DELETE_IN_PROGRESS`. Let CloudFormation finish; do not detach or delete Lambda-managed ENIs manually.

## Shared behavior

1. **Queue:** `/kyc/submit` is the only producer. Standard SQS message fields are `kyc_attempt_id`, `kyc_case_id`, `customer_id`, `s3_bucket`, `s3_key`, and `document_type`; no S3 event is configured.
2. **Attempt and upload:** `/kyc/upload-url` creates the attempt and server-derived key `documents/{customer_id}/{attempt_id}/{file_name}`. Submit verifies S3 metadata/size/type, commits the document row, then sends SQS. Client retries the same submit after a send failure; no outbox is added for the demo. Worker persistence is idempotent.
3. **Limits:** JPEG, PNG, and PDF; max 10 MiB and 3 PDF pages. The API checks actual S3 metadata and the worker independently bounds reads.
4. **Failure:** after three failed deliveries, the worker attempts to atomically set case/attempt to `REVIEW_REQUIRED` and add `OCR_RETRY_LIMIT` audit; it returns the failed SQS record for DLQ delivery. If RDS is down, the transition may fail; investigate/redrive after recovery.
5. **Statuses:** case: `PENDING`, `PROCESSING`, `AUTO_VERIFIED`, `REVIEW_REQUIRED`, `APPROVED`, `REJECTED`, `REUPLOAD_PENDING`; attempt: `PROCESSING`, `AUTO_VERIFIED`, `REVIEW_REQUIRED`, `APPROVED`, `REJECTED`, `REUPLOAD_REQUESTED`.
6. **Comparison:** Aadhaar name/date of birth/gender; PAN name/date of birth. IDs and Aadhaar address are stored for reviewers but not compared. Missing required fields lead to review.
7. **Notifications:** worker auto-verification sends generic customer SMS by direct SNS phone delivery and email by SES after DB commit. B reviewer decisions notify the customer: approval email, rejection email plus generic SMS, re-upload decision email. No message is sent for ordinary submission. Delivery is best-effort, not exactly-once. Check the SMS spend limit before enabling.
8. **Authentication:** Cognito stays the identity provider. Backend registration/confirmation creates the customer row; Amplify owns sign-in/session/refresh/sign-out. FastAPI validates the Cognito access-token signature, issuer, expiry, `token_use`, and selected pool client ID, then enforces customer/reviewer roles. `/auth/login`, `/auth/refresh`, and `/auth/logout` are not API routes.
9. **Frontend hosting:** static S3 + CloudFront OAC; reviewer details use a static query-string route. CloudFront is disabled until AWS account verification completes.

## Immediate owner actions

- **B:** apply and verify the migration; share the API change set for review; deploy the API after review; verify SES sender and production access; set/check the SMS spending limit; then test API → SQS → RDS.
- **C:** align UI state/badges with case and attempt statuses, resolve frontend dependency audit findings, complete production build/browser verification, and integrate against B's deployed API.
- **A:** keep the OCR worker disabled until B's migration and SES prerequisites are ready; review B's actual change set; then run the deployed upload → SQS → OCR → RDS → API/UI → reviewer/audit/notification workflow. CloudFront waits on AWS account verification.

These are deployment and verification actions, not open contract decisions. Do not claim end-to-end integration from local tests or a temporary network probe.
