# Pramāṇa — Person A / Person B Work Split

**Updated:** 2026-10-30
**Canonical integration contract:** [`INTEGRATION_DECISIONS_2026-10-29.md`](INTEGRATION_DECISIONS_2026-10-29.md)

Person A selected the remaining cross-person decisions at the project owner's direction. The contract is binding for implementation; no design vote is pending.

## Current deployment snapshot

- A's `pramana-dev-foundation` is `UPDATE_COMPLETE` in `us-east-1`; NAT and interface endpoints are absent, OCR is enabled, CloudFront is disabled, and the free S3 gateway endpoint remains.
- B's private RDS instance and customer/reviewer Cognito pools and clients exist. On 2026-10-29 A applied the current Alembic migration using a one-shot Lambda and verified revision `001_initial_schema`, all nine expected tables, and `customers.date_of_birth` as PostgreSQL `date`.
- B's separate reviewed API change set was executed; `pramana-dev-backend` is `CREATE_COMPLETE` and `/health` returns 200 at `https://rimait7lg7.execute-api.us-east-1.amazonaws.com/dev`. The OCR worker is Active and its SQS mapping is Enabled. CloudFront is the only missing deployed application component; AWS account verification blocked its creation.
- A's egress-only IPv6 path is deployed. Temporary private Lambda probes verified Secrets Manager, SQS, SNS, Cognito, SES, and PostgreSQL TLS connectivity without NAT or interface endpoints. The migration runner function, both Lambda-managed ENIs, staged ZIP version, log group, and temporary IAM role have all been removed after the successful run.
- On 2026-10-30 a synthetic live workflow passed access-token auth, presigned S3 upload, SQS, OCR to `REVIEW_REQUIRED`, reviewer queue/detail/decision, customer status, and audit. The `.invalid` notification attempt was rejected and audited. Test users, DB rows, the exact S3 object version, and temporary runner resources were removed.
- The frontend build is in the private encrypted S3 bucket and remains inaccessible until CloudFront is available. CORS currently allows only `http://localhost:3000`; update API and document-bucket CORS after the CloudFront hostname exists. SES production access and SNS SMS service subscription remain unresolved.

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
- Latest shared notification/RDS CA layer output is v7 (the deployed OCR worker uses v7; the API currently uses retained v5): `arn:aws:lambda:us-east-1:682197558335:layer:pramana-dev-shared-notifications:7`.
- On 2026-10-29, temporary read-only Lambda probes in the shared private subnets successfully called Secrets Manager, SQS, SNS, both Cognito pools, and SES, then connected to PostgreSQL with `sslmode=verify-full`. The initial DB probe found no tables; the later one-shot migration result is recorded below. B's backend template sets `Ipv6AllowedForDualStack: true` and uses dual-stack endpoints for SQS/SNS/SES.

## B-to-A/C handoff

- Customer Cognito pool `us-east-1_8Q9onMEne`, client `1rtg8t1nbggjsf2i0d8g7jqqov`; reviewer pool `us-east-1_IQzz0ktCu`, client `5fh52722t9o0le48pieqavtcv0`. More detail: [`../backend/COGNITO_OUTPUTS.md`](../backend/COGNITO_OUTPUTS.md). These are public identifiers, not secrets.
- RDS endpoint `pramana-dev-database-db.citogy2m6wxr.us-east-1.rds.amazonaws.com`, port `5432`, database `pramana_kyc`; secret ARN `arn:aws:secretsmanager:us-east-1:682197558335:secret:rds!db-3d281b6c-5013-4ee5-abc6-2970ac631d50-Cb3oaQ`. Never publish the secret value.
- API URL: `https://rimait7lg7.execute-api.us-east-1.amazonaws.com/dev`; see [`../backend/COGNITO_OUTPUTS.md`](../backend/COGNITO_OUTPUTS.md) for pool/client outputs. Remaining: CloudFront/account verification, final CORS, browser UI acceptance, SES production access, and SNS SMS service/use/spending setup. The SMS attributes call fails because the account lacks the service subscription.
- B reports the customer pool's required custom attributes are configured; `gender` is the standard Cognito attribute. Live read shows SRP is enabled on both clients; customer password auth is also enabled, reviewer password auth is not. The frontend uses Amplify SRP.

## Migration runner verification for Person B (2026-10-29)

### Latest outcome — migration complete

- After the earlier `InsufficientRolePermissions` failures, A staged a fresh Linux x86_64/Python 3.11 package in the existing private, versioned frontend bucket and created a short-lived runner with the existing private subnets/backend SG and shared CA layer. Its role had `AWSLambdaBasicExecutionRole`, `AWSLambdaVPCAccessExecutionRole`, and `secretsmanager:GetSecretValue` scoped only to the RDS secret ARN. IAM simulation allowed the VPC/log actions and secret read. No broad policy was added.
- Lambda reached `Active`; the handler was invoked exactly once and returned `status=verified`, revision `001_initial_schema`, the nine expected tables (`customers`, `kyc_cases`, `kyc_attempts`, `kyc_documents`, `extracted_fields`, `field_comparisons`, `kyc_decisions`, `audit_events`, `reviewers`), and `customers.date_of_birth` type `date`. PostgreSQL TLS verification was enabled with the shared RDS CA. No plaintext DB password was placed in Lambda environment variables or output.
- The temporary Lambda and exact staged S3 object version were deleted and verified absent. Lambda later released both ENIs; A then removed the temporary role's remaining VPC policy and deleted the role. Final live checks found no function, ENIs, role, log group, object versions, or delete markers.
- The exact cause of the older generic `InsufficientRolePermissions` state remains unproven. CloudTrail shows one failed retry called `CreateFunction` about 42 seconds after the role's final policy attachment; the successful retry called it about five minutes after role/policy creation and created both ENIs. Another failed retry had a longer delay, so IAM propagation timing is only a plausible contributor, not a confirmed cause. The successful provisioning proves the controlled role/network/package path works. AWS Support is no longer a blocker to migration; do not broaden IAM without specific denial evidence.

- A's read-only probe confirmed the private Lambda path can retrieve the RDS-managed secret and connect to `pramana-dev-database-db.citogy2m6wxr.us-east-1.rds.amazonaws.com:5432/pramana_kyc` using the existing backend SG and the shared RDS CA. The secret contains only `username` and `password`; pass the RDS host and database name separately. The query observed `alembic_revision=null` and no public tables. It performed no writes.
- Further CloudTrail review of B's later retry shows `AWSLambdaVPCAccessExecutionRole` was attached before `CreateFunction`, the Lambda role was assumed successfully, and EC2 `CreateNetworkInterface` dry-run checks in both subnets returned `Client.DryRunOperation`. The CreateFunction event was at `2026-10-29 07:45:27Z`, request ID `78a8510e-d1bd-4570-9923-4fe1b88a304c`. These are permission checks only: no actual ENI-create event followed. No explicit denied API action identifying the cause was retained. The function was deleted before its failure state could be captured, so the reported `InsufficientRolePermissions` cannot be attributed to a specific missing IAM action from the available evidence.
- A reproduced the failure on 2026-10-29 using the same Lambda name, private subnets, backend SG, dual-stack setting, shared CA layer, a secret-scoped `GetSecretValue` policy, and AWS managed VPC execution policy v3 attached before creation. Lambda reached `Pending` then `Failed`; `StateReasonCode=InsufficientRolePermissions`, `StateReason="The function's execution role doesn't have permission to perform this operation."`, and all `LastUpdateStatus*` fields were null. IAM simulation returned `allowed` for all six EC2 actions in AWS's Lambda VPC checklist and the three log actions; the `pramana-admin` caller also simulated `allowed` for all four VPC resource-description actions. The managed policy v3 contains the six documented EC2 actions on `*`. CloudTrail lookup returned no matching EC2 denial for this retry. This still does not identify an actual missing permission, so no IAM policy was widened.
- Do not broaden the role policy based on that message alone. For another diagnostic retry, preserve the function and role long enough to immediately capture `get-function-configuration` fields `State`, `StateReasonCode`, `StateReason`, `LastUpdateStatus`, `LastUpdateStatusReasonCode`, and `LastUpdateStatusReason`, along with the CreateFunction request ID and timestamp. If those details still do not identify an explicit denied action, give the evidence to AWS Support before changing IAM. [Lambda VPC guidance](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html) lists the required ENI actions and the `AWSLambdaVPCAccessExecutionRole` managed policy; [EC2 DryRunOperation](https://docs.aws.amazon.com/ec2/latest/devguide/errors-overview.html) means the checked request was authorized, not that every Lambda networking operation was proven.
- Historical result for the earlier attempt: the Lambda failed before becoming Active, so that package was not invoked. The separate controlled retry summarized above is the later result and supersedes the earlier migration-pending statement.
- The earlier `pramana-dev-a-db-connectivity-probe` stack and the separate migration runner's function, ENIs, role, log group, and staged object are all absent. No Lambda-managed ENIs were detached or deleted manually.

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

- **B/account owner:** request SES production access and resolve SNS SMS subscription/use/spending prerequisites before testing real delivery. API change-set review, migration, and API-to-worker workflow are complete.
- **C:** after AWS account verification enables CloudFront, publish the private static site through the reviewed distribution and run browser registration/confirmation, customer/reviewer auth, upload, status, and audit checks. Update API and document-bucket CORS to the CloudFront hostname.
- **A:** keep NAT and paid interface endpoints absent; after CloudFront/account verification, review the production CORS update and finish the output handoff. The deployed OCR worker and API-to-reviewer flow are already tested with synthetic data.

These are deployment and verification actions, not open contract decisions. Do not claim end-to-end integration from local tests or a temporary network probe.
