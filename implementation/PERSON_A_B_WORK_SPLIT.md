# Pramāṇa — Person A / Person B Work Split

**Updated:** 2026-10-29
**Canonical integration contract:** [`INTEGRATION_DECISIONS_2026-10-29.md`](INTEGRATION_DECISIONS_2026-10-29.md)

Person A selected the remaining cross-person decisions at the project owner's direction. The contract is binding for implementation; no design vote is pending.

## Current deployment snapshot

- A's `pramana-dev-foundation` is deployed in `us-east-1`; NAT is absent, OCR and CloudFront are disabled, and the free S3 gateway endpoint remains.
- B's private RDS instance and the customer/reviewer Cognito pools and clients exist. B has not applied the Alembic migration or verified the database catalog.
- There is no deployed backend API/Lambda, OCR worker, verified SES sender, or CloudFront distribution. B has not supplied an API deployment change set for review.
- A's egress-only IPv6 path is deployed and was verified by a read-only Lambda probe from the private subnets to Secrets Manager, SQS, SNS, Cognito, and SES. The temporary probe stack is being deleted; cleanup must be checked before it is reported removed.
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
- On 2026-10-29, a temporary read-only Lambda in the shared private subnets successfully called Secrets Manager, SQS, SNS, both Cognito pools, and SES. B's backend template sets `Ipv6AllowedForDualStack: true` and uses dual-stack endpoints for SQS/SNS/SES.

## B-to-A/C handoff

- Customer Cognito pool `us-east-1_8Q9onMEne`, client `1rtg8t1nbggjsf2i0d8g7jqqov`; reviewer pool `us-east-1_IQzz0ktCu`, client `5fh52722t9o0le48pieqavtcv0`. More detail: [`../backend/COGNITO_OUTPUTS.md`](../backend/COGNITO_OUTPUTS.md). These are public identifiers, not secrets.
- RDS endpoint `pramana-dev-database-db.citogy2m6wxr.us-east-1.rds.amazonaws.com`, port `5432`, database `pramana_kyc`; secret ARN `arn:aws:secretsmanager:us-east-1:682197558335:secret:rds!db-3d281b6c-5013-4ee5-abc6-2970ac631d50-Cb3oaQ`. Never publish the secret value.
- Pending: applied and verified Alembic migration, backend API URL/Lambda, SES sender identity and production access, and reviewed B-owned API change set.
- B reports the customer pool's required custom attributes are configured; `gender` is the standard Cognito attribute. Live read shows SRP is enabled on both clients; customer password auth is also enabled, reviewer password auth is not. The frontend uses Amplify SRP.

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
