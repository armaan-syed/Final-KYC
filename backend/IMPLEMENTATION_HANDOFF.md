# Person B backend and deployment checkpoint

**Updated:** 2026-10-29 after B's `master` push and A integration review.

## Implemented in source

- FastAPI configuration, customer/KYC/reviewer routes, SQLAlchemy models, initial Alembic migration, S3 presigned upload/download, SQS producer, transactional reviewer decisions/audit, and SNS/SES notification adapter.
- Registration validates ISO date of birth, writes the configured Cognito attributes, uses standard `gender`, and creates the PostgreSQL customer row after confirmation. Amplify owns sign-in, session refresh, and sign-out; backend `/auth/login`, `/auth/refresh`, and `/auth/logout` routes are removed by the shared contract.
- B's Cognito outputs and current public configuration are recorded in [`COGNITO_OUTPUTS.md`](COGNITO_OUTPUTS.md). Both pools/clients exist, and reviewer self-registration is disabled.
- Private RDS is deployed as `pramana-dev-database`: PostgreSQL 18.3, `db.t4g.micro`, 20 GiB encrypted storage, single-AZ, non-public, and one-day automated backup retention. Credentials are RDS-managed in Secrets Manager. The database stack has `DeletionPolicy: Retain`.
- The backend template consumes the shared network and notifications layer; it does not create another VPC, shared API, or duplicate layer. Its Lambda is configured for IPv6 in dual-stack subnets. SNS direct-phone permission is region-scoped, `AdminGetUser` is scoped to the customer pool ARN, and the RDS secret/SQS/S3/SES permissions are scoped.

## A-owned blockers reported by B: resolved

- Person A deployed outbound-only IPv6 egress through an egress-only Internet Gateway, without NAT or interface endpoints. A read-only Lambda in the same private subnets passed service API checks for Secrets Manager, SQS, SNS, both Cognito pools, and SES. SQS/SNS/SES checks used dual-stack endpoints. The temporary stack is still reported by AWS as `DELETE_IN_PROGRESS`; A must verify its cleanup.
- Person A reviewed the API authorization boundary and fixed FastAPI token validation to accept signed Cognito **access tokens**, validating signature, issuer, expiry, `token_use=access`, and app-client `client_id` for the selected customer/reviewer pool. FastAPI applies role guards; API Gateway stays a proxy with no second authorizer.
- A pulled B's `cdfeedf` commit on `master` before restoring A's work. The updated source/tests/docs will be committed and pushed to the same branch for B to pull.

This connectivity test proves network egress from a temporary function; it does not prove the backend Lambda, `GetSecretValue`, RDS connection, API authorization in AWS, or the full application flow.

## B-owned work still outstanding

- **Migration/catalog:** Alembic has not been applied to RDS; the live schema/catalog has not been verified. The developer workstation has no route to private RDS. Apply it from a controlled, short-lived runner inside the approved VPC using the RDS secret; do not put the secret in source control or logs.
- **API deployment:** no B-owned API change set was available for A review. Prepare and share the actual change set, then wait for A's resource/cost/replacement review before execution. Do not deploy the component template as a parallel shared API/network stack.
- **Email/SMS:** no SES sender identity is verified and production access is pending. Verify the sender and check the SNS account SMS spend limit before enabling customer notifications.
- **Integration:** after migration and API deployment, verify API-to-RDS, SQS enqueue, customer/reviewer authorization, reviewer decision/audit, and notification behavior. A should enable the OCR worker only after the schema and SES prerequisites are ready.

## Current source and test status

- Local backend test suite after integrating B's push and A's changes: **33 passed** (34 deprecation warnings).
- OCR/worker suite: **33 passed, 1 skipped**. The skipped test requires a dedicated PostgreSQL database migrated to B's schema; an earlier disposable migrated-PostgreSQL worker check passed before this pull.
- AWS CloudFormation validation and source-level SAM/lint checks are recorded in `implementation/PERSON_A_IMPLEMENTATION_PLAN.md`. These do not substitute for the pending B change-set review or live API/database integration.

No database password, Cognito user credentials, tokens, real identity documents, or customer data are recorded in this handoff.
