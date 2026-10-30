# Person B backend and deployment checkpoint

**Updated:** 2026-10-30 after deployed API/OCR integration verification.

## Current live checkpoint

- The RDS migration/catalog is verified at `001_initial_schema` with nine application tables, 67 expected columns, and `customers.date_of_birth` as PostgreSQL `DATE NOT NULL`.
- The reviewed B API stack is deployed at `https://rimait7lg7.execute-api.us-east-1.amazonaws.com/dev`; health is 200. The A OCR worker is Active with its SQS event mapping Enabled.
- A synthetic live API flow passed customer/reviewer Cognito access-token authentication, presigned S3 upload, submit/SQS, worker OCR to `REVIEW_REQUIRED`, reviewer queue/detail, re-upload decision, customer status, and audit persistence. Synthetic users, rows, object version, and temporary runner artifacts were removed. The `.invalid` SES notification was rejected and its provider outcome was recorded; no real email or SMS was delivered.
- Backend tests: **36 passed**. OCR tests: **36 passed, 1 skipped** (optional PostgreSQL test). Frontend tests: **5 passed**; production build succeeded; `npm audit --omit=dev`: **0 vulnerabilities**.
- Remaining release work is AWS account verification/CloudFront, final API and S3 CORS for the CloudFront origin, browser registration and UI checks, SES production access, and SNS SMS service/use/spend configuration. The current frontend is stored privately in S3 and is not public.

## Implemented in source

- FastAPI configuration, customer/KYC/reviewer routes, SQLAlchemy models, initial Alembic migration, S3 presigned upload/download, SQS producer, transactional reviewer decisions/audit, and SNS/SES notification adapter.
- Registration validates ISO date of birth, writes the configured Cognito attributes, uses standard `gender`, and creates the PostgreSQL customer row after confirmation. Amplify owns sign-in, session refresh, and sign-out; backend `/auth/login`, `/auth/refresh`, and `/auth/logout` routes are removed by the shared contract.
- Customer DOB is a calendar date in the ORM and initial Alembic migration (`DATE`/SQLAlchemy `Date`); a focused model test asserts the stored type. This corrects a mismatch found in the checked-in source before running the live migration.
- B's Cognito outputs and current public configuration are recorded in [`COGNITO_OUTPUTS.md`](COGNITO_OUTPUTS.md). Both pools/clients exist, and reviewer self-registration is disabled.
- Private RDS is deployed as `pramana-dev-database`: PostgreSQL 18.3, `db.t4g.micro`, 20 GiB encrypted storage, single-AZ, non-public, and one-day automated backup retention. Credentials are RDS-managed in Secrets Manager. The database stack has `DeletionPolicy: Retain`.
- The backend template consumes the shared network and notifications layer; it does not create another VPC, shared API, or duplicate layer. Its Lambda is configured for IPv6 in dual-stack subnets. SNS direct-phone permission is region-scoped, `AdminGetUser` is scoped to the customer pool ARN, and the RDS secret/SQS/S3/SES permissions are scoped.

## A-owned blockers reported by B: resolved

- Person A deployed outbound-only IPv6 egress through an egress-only Internet Gateway, without NAT or interface endpoints. A read-only Lambda in the same private subnets passed service API checks for Secrets Manager, SQS, SNS, both Cognito pools, and SES. SQS/SNS/SES checks used dual-stack endpoints. AWS has now deleted the temporary probe stack, Lambda, and IAM role.
- Person A reviewed the API authorization boundary and fixed FastAPI token validation to accept signed Cognito **access tokens**, validating signature, issuer, expiry, `token_use=access`, and app-client `client_id` for the selected customer/reviewer pool. FastAPI applies role guards; API Gateway stays a proxy with no second authorizer.
- A pulled B's `cdfeedf` commit on `master` before restoring A's work; that source/test/doc reconciliation was pushed. This 2026-10-30 checkpoint records the later deployed integration result above.

The earlier connectivity note above records what was known before the API deployment. It is superseded by the 2026-10-30 live synthetic upload-to-review test in the current checkpoint; the browser UI and production notification delivery remain unverified.

## Historical B-owned work still outstanding — 2026-10-29

- **Migration/catalog:** Alembic has not been applied to RDS; the live schema/catalog has not been verified. The developer workstation has no route to private RDS. A's private Lambda probe previously verified the database network path. A's new runner attempt failed with generic `InsufficientRolePermissions` even though AWSLambdaVPCAccessExecutionRole v3 was attached and its documented actions simulated as allowed. No specific denial was found; the temporary function and role were removed without invocation. Escalate the captured state to AWS Support before changing IAM. The reproducible runner is `migration_runner.handler`, built with `scripts/build_migration_runner.py`; invoke only after it becomes Active and do not put database credentials in source control or logs.
- **API deployment:** no B-owned API change set was available for A review. Prepare and share the actual change set, then wait for A's resource/cost/replacement review before execution. Do not deploy the component template as a parallel shared API/network stack.
- **Email/SMS:** live SES inspection returned no email identities. Verify a sender and obtain production access. The SNS SMS-attributes read failed because this AWS account has no subscription for the service; enable/access the service and confirm the spend limit before customer SMS is enabled.
- **Integration:** after migration and API deployment, verify API-to-RDS, SQS enqueue, customer/reviewer authorization, reviewer decision/audit, and notification behavior. A should enable the OCR worker only after the schema and SES prerequisites are ready.

## Earlier source and test status — 2026-10-29

- Re-run on the current local source: backend suite **34 passed** (34 deprecation warnings) after the customer DOB model test was added. The local validation environment was Python 3.14, not the deployed Python 3.11 Lambda runtime. Earlier OCR/worker suite **33 passed, 1 skipped** in the standard run; frontend suite **2 passed** and static production build passed at `2b9f5ea`.
- The opt-in worker/PostgreSQL integration test also passed (**1 passed**) after applying the actual Alembic migration to a disposable PostgreSQL 16 database; the disposable container was removed. This does not verify the live RDS catalog or connectivity from B's Lambda.
- Local static HTTP checks returned 200 for all 10 exported routes. `npm audit --omit=dev` reports 3 findings (1 critical, 2 high); Person C should assess the compatible fix before frontend release.
- AWS CloudFormation validation and source-level SAM/lint checks are recorded in `implementation/PERSON_A_IMPLEMENTATION_PLAN.md`. These do not substitute for the pending B change-set review or live API/database integration.

No database password, Cognito user credentials, tokens, real identity documents, or customer data are recorded in this handoff.
