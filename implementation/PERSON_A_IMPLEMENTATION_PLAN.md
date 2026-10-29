# Pramāṇa — Person A Implementation Plan

This is the standalone implementation plan for Person A. It follows the project context in `context/person-a.md`, `context/person-b.md`, `context/person-c.md`, `context/pramana-context.md`, and `context/project.md`. The current A/B resource ownership split is documented in [`PERSON_A_B_WORK_SPLIT.md`](PERSON_A_B_WORK_SPLIT.md) and clarifies overlapping infrastructure assignments.

## Shared instructions for all implementation agents

1. Inspect the repository, all relevant context files, Git status, existing code, configuration, and available test commands before changing anything. Record unrelated changes and leave them untouched.
2. Keep each change within the existing assignment. Do not introduce additional product flows, services, data fields, roles, or deployment targets.
3. Implement in small stages: **implement → test → inspect results → continue**. A stage is complete only when its tests pass and its acceptance criteria below are met. Add tests with the code; do not postpone them to the end.
4. Use local fakes, fixtures, or SAM local where cloud resources are unavailable. Clearly label what was tested locally versus against deployed AWS resources. Never report a cloud integration as verified if it was only mocked.
5. Never commit AWS credentials, database passwords, real identity documents, or real customer data. Keep local `.env` files ignored; use Secrets Manager and encrypted Lambda configuration for deployed secrets.
6. Keep the existing stack: AWS SAM, S3/CloudFront, API Gateway, Lambda, Cognito, SQS, PostgreSQL/RDS, Tesseract/OpenCV, SNS, SES, and CloudWatch. The frontend remains Next.js/React/TypeScript/Tailwind with Amplify Auth and the existing API.
7. Where the source documents conflict, do not silently implement both behaviors. Resolve the item at the shared contract checkpoint below, record the selected existing behavior in a small integration contract/change note, and make all three implementations and tests match it. Do not treat unresolved contract questions as permission to add a feature.

## Shared contract checkpoint

The shared decisions are selected by Person A at the project owner's direction and are recorded in [`INTEGRATION_DECISIONS_2026-10-29.md`](INTEGRATION_DECISIONS_2026-10-29.md). Person B and Person C should follow that contract; no design vote is pending. The local implementation now includes:

- **Queue and recovery:** `POST /kyc/submit` is the only producer; the message stays six fields and standard SQS. Submit commits before enqueue; the same request is retried after send failure, and worker writes remain idempotent. On the third failed receive, a valid attempt is moved to `REVIEW_REQUIRED` in one transaction while the message is still sent to the DLQ.
- **Bounded uploads:** shared limit is 10 MiB and 3 PDF pages. B's submit path now verifies S3 HeadObject size/type before queueing; the worker independently bounds its read and PDF page count.
- **Comparison and status:** Aadhaar name/date of birth/gender; PAN name/date of birth. Identifiers and Aadhaar address are stored for reviewers but not compared. Case/attempt status values remain separate and explicit in the linked decision record.
- **Notifications and authentication:** retain SNS direct-to-phone SMS plus SES email after committed auto-verification; B owns reviewer-decision notifications. Cognito remains auth; registration/confirmation use B's API, Amplify owns sign-in/session handling, and FastAPI validates role-specific Cognito tokens.
- **Network:** the dual-stack private-subnet path is deployed through an egress-only IPv6 gateway; IPv6 Lambda egress is TCP 443 only. Existing IPv4 default egress has no public IPv4 route. No NAT or paid interface endpoints are deployed. A read-only Lambda probe from the private subnets succeeded against Secrets Manager, SQS, SNS, Cognito, and SES.

Person B's and C's implementation actions are listed in the linked decision record.

---

## Person A

### Existing assigned responsibility

Own the shared AWS foundation and OCR worker: VPC/network foundation, private document and frontend storage, SQS/DLQ and OCR Lambda/layer, CloudFront, CloudWatch, shared SAM integration, and deployment review. Person B owns Cognito, the RDS instance/database secret, backend Lambda/API resources, and notification-specific SNS/SES resources as defined in the A/B work split. Person A wires the shared components and B's outputs together and implements the worker's database/notification integration.

### Implementation objective

Deliver a deployable, least-privilege AWS stack and a working OCR worker that accepts the agreed SQS contract, processes documents, persists extraction/comparison outcomes using Person B's schema, sets the agreed status, and emits the correct existing notifications.

### Person A execution status

#### Implemented and locally verified

- [x] Inspected the project context and repository state. No unrelated pre-existing changes were present; Person B and Person C AWS access has not been modified.
- [x] Built the Aadhaar/PAN OCR parser, normalization, comparison, synthetic fixtures, and original Python 3.12 Lambda runtime proof. The 2026-10-28 proof passed for synthetic Aadhaar PNG, PAN PNG, and Aadhaar PDF; recorded times were below one second each.
- [x] Implemented the SQS worker, server-derived key and bucket checks, S3 document handling, status rules, transactional PostgreSQL writes, duplicate-delivery locking, partial batch retry response, and shared SNS/SES notification adapter.
- [x] Aligned B's producer with the standard queue and six-field message. The backend now commits document/attempt rows before enqueueing and maps case/attempt re-upload states separately.
- [x] Fixed B/A integration defects in the migration: JSONB argument spelling and database UUID server defaults required for direct worker inserts. Added the VPC ENI execution policy to B's VPC-attached Lambda role.
- [x] Ran a disposable PostgreSQL integration check using the current migration DDL and worker repository: one transaction persisted extraction, comparisons, status, decision, and audit; redelivery created no duplicate rows. The host's PostgreSQL build does not include `pgcrypto`, so only that extension statement was omitted from the temporary test copy.
- [x] Mapped Tesseract word confidence to parsed fields when their OCR tokens match, persisted that value in B's nullable `confidence` column, and retained `NULL` if a reliable token mapping is unavailable.
- [x] Re-ran the combined-checkout suites on `master` at `2b9f5ea`: backend `33 passed` (34 dependency deprecation warnings); OCR/worker `33 passed, 1 skipped` in the default run; frontend `2 passed`; Next.js static production build passed.
- [x] Re-ran the optional database integration against an isolated PostgreSQL 16 container: applied the repository's actual Alembic `upgrade head`, ran the worker persistence/idempotency integration test (`1 passed`), and removed the disposable database container. This verifies the current migration and worker repository locally, not the live RDS catalog.
- [x] Served the generated static export locally and checked 10 customer/reviewer routes, including the query-string case-detail route; all returned HTTP 200.
- [x] Expanded the shared SAM template with the private VPC, two private subnets, private buckets, conditional CloudFront OAC, encrypted standard queue/DLQ, conditional OCR worker/layers, least-privilege role, alarms, and operations dashboard. B's backend template accepts A's network/bucket/queue outputs, loads DB credentials from Secrets Manager with verified TLS, and runs inside the VPC.
- [x] Parsed both current SAM templates locally and checked `Ref`, `GetAtt`, and `Sub` names: 43 root resources and 3 backend resources, with no unresolved local references.
- [x] Ran `cfn-lint` 1.58.0 on both current templates successfully, excluding W1030 for caller-supplied ARN string parameters.

#### Remaining before calling Person A complete

- [x] Built and validated the updated layer in the official Python 3.12 x86_64 Lambda runtime: Tesseract 5.5.2, Leptonica 1.87.0, OpenCV 5.0.0, NumPy 2.5.4, PDFium 5.14.0, and psycopg2 2.9.10 imported; native libraries and English/Hindi language data passed checks. The actual worker auto-verified synthetic Aadhaar PNG, PAN PNG, and Aadhaar PDF inputs at 100%, with name confidence 95–96 and runtimes 0.33–0.73s.
- [x] Measured the layer ZIP at 93,834,078 bytes and its expanded contents at 250,219,932 bytes. Function code plus all attached layers measured 258,176,462 bytes against the 262,144,000-byte Lambda quota, leaving only 3,967,538 bytes of headroom. The ZIP exceeds direct upload size and must be staged through S3.
- [x] Ran basic `sam validate` on the current root and backend templates and a containerized `sam build` of the root stack. `cfn-lint` passes both templates with W1030 excluded.
- [x] Ran AWS CloudFormation `validate-template` on both templates using the non-root `pramana-admin` IAM identity in account `682197558335`, region `us-east-1`.
- [x] Installed `cfn-guard` and the AWS Guard Rules Registry, then scanned the exact foundation deployment scope.
- [x] Received explicit approval for the reviewed change set.
- [x] Deployed the A-owned foundation with the OCR worker and CloudFront disabled, then verified the AWS-assigned VPC, private subnet, and security-group outputs for Person B.
- [x] Verified AWS Lambda/VPC and service endpoint documentation, reviewed the application AWS calls, and removed the NAT gateway, its public IPv4, and public egress routes through a reviewed CloudFormation update. The VPC, private subnets, security groups, buckets, SQS/DLQ, and free S3 gateway endpoint remain.
- [x] Selected outbound-only IPv6 through an egress-only Internet Gateway as the lowest fixed-cost runtime path. The root stack routes the two private subnets over IPv6; Lambda IPv6 egress is restricted to TCP 443, S3 stays on its free gateway endpoint, and no NAT/interface endpoints are added.
- [x] Removed the optional NAT gateway, Elastic IP, public subnet/routes, and NAT enable parameter from the A-owned root template. NAT can no longer be enabled by a deployment parameter; the tested IPv6 egress-only gateway and free S3 gateway endpoint remain. `cfn-lint 1.58.0 -i W1030` passes on the updated root template.
- [x] Resolved the B/C contracts for queue recovery, final-retry/DLQ status, upload limits, Aadhaar comparison, Cognito/Amplify ownership, notifications, status display, and static routes; see the linked decision record.
- [x] Added authoritative S3 size/type validation before API enqueue and bounded the worker to 10 MiB / 3 PDF pages.
- [x] Added final-retry handling: persist `REVIEW_REQUIRED` and an audit event on the third failure while retaining the message for DLQ alarm/inspection.
- [x] Updated backend Cognito verification to validate signed access tokens against issuer, expiry, token use, and selected pool client ID; removed duplicate backend login/refresh/logout routes so Amplify owns sessions. Added token and auth-contract tests.
- [x] Aligned B/C integration source: standard Cognito `gender`, API-backed registration/confirmation, actual S3 size/type validation, SNS direct-phone IAM scope, and explicit third-retry review transition.
- [x] Deployed the no-NAT IPv6 path using two reviewed CloudFormation change sets without replacing the existing subnets. Verified the VPC `/56`, both subnet `/64`s, active egress-only routes, TLS-only IPv6 Lambda egress, and security-group drift state.
- [x] Invoked a temporary read-only Lambda in the private subnets; Secrets Manager, SQS, SNS, Cognito, and SES API checks succeeded. Follow-up AWS checks confirmed the temporary stack no longer exists, the probe IAM role is absent, and no Lambda function remains.
- [x] Rechecked and fast-forwarded/pushed the integrated source to `master` at `2b9f5ea`; a fresh fetch found no newer commit.
- [ ] Complete CloudFront after AWS account verification allows distribution creation; `EnableCloudFront` remains false.
- [ ] B must apply Alembic migration and verify the live database catalog; provide a reviewed API change set and deploy the backend/API. No B-owned API change set exists yet.
- [ ] B must verify an SES sender and production access, and set/check the account SMS spending limit before customer notifications are enabled.
- [ ] Enable/deploy the OCR worker only after the database migration is verified and SES identity/configuration is ready.
- [ ] C must finish the frontend contract/status work, resolve current frontend dependency audit findings, build the static site, and deploy when CloudFront/account verification permits.
- [ ] Review B's actual change set before deployment; do not deploy B-owned resources from a template alone.
- [ ] Run deployed upload → SQS → OCR → RDS → API/UI → reviewer → audit/notification checks after B/C deployments; finish the output handoff.

#### Revalidation snapshot (2026-10-29, `2b9f5ea`)

- `backend/tests`: **33 passed**, 34 dependency deprecation warnings.
- `infra/ocr/tests`: **33 passed, 1 skipped** in the standard run; the skipped opt-in test then passed separately (`1 passed`) against the actual Alembic schema on a disposable PostgreSQL 16 container.
- `frontend`: **2 passed**; `npm run build` passed and emitted the customer/reviewer static routes; local static HTTP checks returned **200 for all 10 routes**.
- Template checks: `cfn-lint -i W1030` passed for the root, backend, and database templates; root `sam validate`, backend `sam validate --lint`, and AWS CloudFormation validation of the backend template passed.
- `npm audit --omit=dev` still reports **3 production dependency findings** (Next.js critical; nested PostCSS and Zod high). This is assigned to Person C to review for the static-export build before release.
- Live AWS check used IAM user `pramana-admin` in account `682197558335`, region `us-east-1`: RDS is `available`, encrypted, and not public; the foundation has `EnableOCRWorker=false` and `EnableCloudFront=false`; no NAT gateway or CloudFront distribution exists; the only VPC endpoint is the S3 gateway endpoint; there is no deployed API Gateway API or Lambda function. No SES email identities are verified. The SNS SMS-attributes query is blocked because this account has no subscription for that service.
- The actual deployed RDS migration/catalog, API-to-RDS/SQS integration, OCR worker invocation, customer/reviewer browser flow, reviewer audit/decision, and real notifications remain unverified because their B-owned deployment/configuration prerequisites are not ready. The temporary network probe and its IAM role are fully deleted. Do not label the application end-to-end complete yet.

#### AWS foundation deployment and no-NAT update (2026-10-29)

- Identity/region: non-root IAM user `pramana-admin`, account `682197558335`, `us-east-1`. No root identity was used.
- Foundation stack: `pramana-dev-foundation`, deployed by the non-root `pramana-admin` identity. `EnableOCRWorker=false`; `EnableCloudFront=false`. The stack does not create Person B's RDS, Cognito, backend/API, or notification provider resources. CloudFront could not be created because AWS account verification is pending.
- No-NAT update: change set `arn:aws:cloudformation:us-east-1:682197558335:changeSet/samcli-deploy1793222841/58ff383f-dfb4-4abb-9f8b-04e596297701`; exact review showed only ten removals (NAT, EIP, private default routes, and public subnet/Internet Gateway routing resources), with no additions, modifications, or replacements. It was executed under the user's instruction not to retain NAT. CloudFormation now reports `UPDATE_COMPLETE`; NAT state is `deleted`, and both private route tables retain only the VPC-local route and the S3 gateway-endpoint route.
- IPv6 egress update: first associated AWS-assigned VPC range `2600:1f18:4020:8800::/56` with a one-resource change set; then used `AWS::EC2::SubnetCidrBlock` associations, an egress-only Internet Gateway, and two `::/0` routes. The second reviewed change set added only those resources and added IPv6 TCP 443 egress to the backend/OCR security groups; no subnet replacements, NAT, or interface endpoints. Final update change set ARN: `arn:aws:cloudformation:us-east-1:682197558335:changeSet/samcli-deploy1793227129/c8e5d457-a4a6-4f90-a7e3-4c71fd7fc272`. Subnets now use `2600:1f18:4020:8800::/64` (1a) and `2600:1f18:4020:8801::/64` (1b); egress-only gateway `eigw-0e03c52bb1008d130`. Both route tables show active IPv6 default routes through that gateway. AWS automatically added unrestricted IPv6 egress rules during IPv6 association; those were removed, leaving only TCP 443 over IPv6. The pre-existing IPv4 `0.0.0.0/0` security-group egress has no public IPv4 route. Live rule inspection and CloudFormation drift detection reported both groups `IN_SYNC`.
- Private service connectivity: a reviewed, temporary Lambda in the same private subnets and backend security group successfully made read-only calls to Secrets Manager, SQS, SNS, both Cognito pools, and SES. SQS/SNS/SES checks used dual-stack clients. Invocation returned HTTP 200 with all five checks true. The temporary probe stack is being deleted; it is not a project workload deployment.
- Verified handoff outputs: VPC `vpc-0f16fa3dea85f7b0d`; private subnet A `subnet-0e45971a48d73a18a` (`us-east-1a`); private subnet B `subnet-03c8032601117f445` (`us-east-1b`); database SG `sg-02235e74a0e910c37`; backend Lambda SG `sg-02823dd2442632bed`; OCR worker SG `sg-0751ba5b887acb41c`. Database ingress is TCP 5432 only from the backend and OCR worker security groups.
- Other deployed outputs: document bucket `pramana-dev-foundation-documentbucket-r77xgfetn3cj`; frontend bucket `pramana-dev-foundation-frontendbucket-zrczgq4ffaex` (CloudFront is not active); OCR queue URL `https://sqs.us-east-1.amazonaws.com/682197558335/pramana-dev-foundation-OCRQueue-LrTO9SM80mE2`; queue ARN `arn:aws:sqs:us-east-1:682197558335:pramana-dev-foundation-OCRQueue-LrTO9SM80mE2`; DLQ ARN `arn:aws:sqs:us-east-1:682197558335:pramana-dev-foundation-OCRDeadLetterQueue-OmAX1603xWcZ`; alarm topic `arn:aws:sns:us-east-1:682197558335:pramana-dev-alarms`. The alarm topic is for infrastructure alarms, not customer notifications.
- Egress design and costs: the free S3 gateway endpoint remains. The egress-only gateway has no hourly charge; outbound data transfer can be billed. No NAT or interface endpoints are deployed. Four interface endpoints across two AZs would add about `$58.40/month` in fixed hourly charges at the current `$0.01/AZ-hour` rate, before processing, so the project uses the tested IPv6 path. Cognito Hosted UI/domain traffic still requires public egress; it is outside the user-pool API endpoint. Sources: [Egress-only gateway](https://docs.aws.amazon.com/vpc/latest/userguide/egress-only-internet-gateway.html), [PrivateLink pricing](https://aws.amazon.com/privatelink/pricing/), and [Cognito interface endpoint limitations](https://docs.aws.amazon.com/cognito/latest/developerguide/vpc-interface-endpoints.html).

#### Root template no-NAT hardening and live deployment (2026-10-29)

- Removed all NAT/EIP/public-subnet/Internet-Gateway routing resources and the `EnableNatGateway` parameter from `infra/sam/template.yaml`. After restoring the non-root `pramana-iam-session`, AWS inspection found that NAT was absent but the deployed template still contained dormant NAT definitions. This A-owned source update has now been deployed to `pramana-dev-foundation`.
- Reviewed and executed change set `arn:aws:cloudformation:us-east-1:682197558335:changeSet/samcli-deploy1793252004/800e1841-80ee-436e-8d35-0bf30a7347c3`. It had one in-place modification: restrict the existing free S3 gateway endpoint to `s3:GetObject` on `documents/*`. It added or replaced no resources. Browser uploads use presigned S3 requests from the browser and do not traverse the VPC endpoint.
- AWS now reports the foundation stack `UPDATE_COMPLETE`; `EnableNatGateway` is absent from the deployed parameter set, `EnableOCRWorker=false`, and `EnableCloudFront=false`. The deployed template contains no IPv4 NAT, EIP, internet gateway, public subnet, or NAT-route definitions. VPC route tables have no IPv4 default route; the two private subnet tables have active `::/0` routes through `eigw-0e03c52bb1008d130` and the S3 gateway-endpoint route. The endpoint is `available` with the restricted policy above. CloudFormation drift detection completed with `IN_SYNC` and zero drifted resources.
- Live application prerequisites remain incomplete: RDS `pramana-dev-database-db` is `available`, encrypted, and not public, but no API Gateway API or Lambda function is deployed, no CloudFront distribution exists, and SES has no verified email identity. The OCR worker and CloudFront remain disabled. No Person B or Person C source files or AWS stacks were changed.
- Live storage/queue readbacks: the document bucket has all four S3 public-access blocks enabled, SSE-S3 encryption, versioning enabled, `IsPublic=false`, and browser CORS limited to `PUT` from `http://localhost:3000`. The private frontend bucket also has all public-access blocks enabled and SSE-S3 encryption; it has no CloudFront policy while CloudFront is disabled. The standard OCR queue is encrypted, has a 720-second visibility timeout, 4-day retention, and redrives after 3 receives to the encrypted 14-day DLQ; both queues were empty during inspection.
- Validation: `sam validate` passed; `cfn-lint 1.58.0 -i W1030 -- infra/sam/template.yaml` passed; AWS CloudFormation `validate-template` passed. `sam validate --lint` reports only the two documented W1030 warnings for caller-supplied secret/sender ARN parameters. Current tests: OCR/worker **33 passed, 1 skipped**; backend **33 passed** (34 dependency deprecation warnings); frontend **2 passed**. The skipped OCR test requires a dedicated migrated PostgreSQL database. These local tests do not verify deployed API-to-RDS/SQS, worker, frontend, reviewer, audit, or notification flows.

The current root and backend templates are locally validated and the foundation stack is deployed. RDS and Cognito are B-owned and exist; the OCR worker, backend API, and CloudFront are not deployed. Private service connectivity is verified with a temporary Lambda, not yet through B's backend Lambda or A's OCR worker. The OCR proof ran in the official Lambda runtime image through the rootless Podman-compatible engine; it did not use host-installed Tesseract/OpenCV.

### Prerequisites and dependencies

- Inspect the current tree and the Person A, B, and project context documents.
- Obtain the AWS account/region and secure deployment access. Use a separate administrative identity for daily work; never use root credentials in development.
- Agree with Person B on migration/schema ownership, table/column names, transaction expectations, and the SQS message shape before the worker writes to RDS.
- Resolve the upload-to-SQS, status, comparison-field, notification, and upload-format contracts above.
- Obtain Person B's Cognito pool/client configuration plus the required S3/SQS/API values for infrastructure wiring. Store secrets in Secrets Manager or encrypted Lambda configuration, not source control.

### Step-by-step implementation plan

#### A1. Inspect and establish the infrastructure baseline

- Inspect repository conventions, existing SAM files, AWS profiles, ignored files, and deployment scripts. Do not overwrite an existing stack.
- If no implementation exists, establish an infrastructure folder with a SAM template, parameter/config examples, deployment instructions, and separate OCR worker source/tests. Keep resource names and outputs consistent with the `pramana-*` names in context.
- Keep Person B and Person C's existing `AdministratorAccess` unchanged during this implementation, as explicitly directed by Person A. Person A will remove their access manually after the implementation. Do not edit their users, groups, or policies. Never distribute root credentials.
- Create a resource/output inventory for Person B and C, including the Cognito outputs supplied by Person B.

**Files/modules:** SAM `template.yaml` (at the agreed repo location), SAM config/parameter examples, deployment README or the existing equivalent, OCR source and test modules.

**Test and acceptance:** SAM template validates locally; parameter files contain placeholders only; IAM policies are reviewed for least privilege; resource outputs expose the region, bucket names, queue URL, Cognito IDs, API URL, CloudFront domain/distribution, and notification configuration needed by teammates. No credentials appear in Git.

#### A2. Prove the OCR runtime before building the full stack

- Build a minimal Lambda layer for the selected Lambda architecture with Tesseract, `pytesseract`, OpenCV, and the required English/Hindi language data from the context.
- Confirm the packaged layer fits within the documented 250 MB unzipped limit and that the binary runs in the Lambda-compatible environment.
- Run representative, non-sensitive Aadhaar and PAN fixtures through preprocessing and OCR. Check raw output, parser inputs, execution duration, and Lambda-compatible filesystem use (`/tmp`).
- Keep the documented Rekognition DetectText fallback as a contingency only if the Tesseract POC fails; report the failure and required contract/cost changes before switching.

**Files/modules:** layer build recipe, layer contents, a small POC Lambda handler, sanitized OCR fixtures, POC instructions/results.

**Test and acceptance:** layer imports and invokes inside the target Lambda runtime; both fixture types produce raw text usable by the parser; size is within limit; record timing against Person A's documented target of under 30 seconds and the worker timeout of 120 seconds with queue visibility at least six times that timeout, plus limitations. Do not proceed on an unverified assumption that local desktop OpenCV/Tesseract will run on Lambda.

#### A3. Implement SAM infrastructure in dependency order

1. Define parameters for region, stage, domain/origin settings, DB sizing, and sender configuration; provide safe demo defaults only where the context already defines them.
2. Provision the VPC/private subnets and network/security-group foundation. Use the deployed dual-stack subnet and egress-only IPv6 gateway path; keep NAT and paid interface endpoints absent. S3 uses the free gateway endpoint. Person B provisions private PostgreSQL RDS and its Secrets Manager credential inside this network. Allow PostgreSQL on 5432 only from the backend and OCR worker groups, and never make RDS public.
3. Provision the private, versioned, SSE-S3 document bucket with all public access blocked and the agreed CORS origin/methods for presigned PUT. Use bucket policies/IAM roles limited to this bucket. Enable the documented document-bucket access logging to a separate private log bucket.
4. Provision the frontend S3 bucket as private and serve it through CloudFront with OAC, consistent with Person A's detailed bucket security section and the project architecture. Do not deploy a public S3 website endpoint.
5. Provision the standard OCR queue and DLQ with 720-second visibility timeout (six times the 120-second worker timeout), 4-day main-queue retention, 14-day DLQ retention, redrive after 3 failed receives, batch size 1, and maximum worker concurrency 5. Wire only the selected enqueue path from the contract checkpoint.
6. Consume the customer and reviewer Cognito user pools/app clients configured by Person B. FastAPI validates Cognito access tokens using the matching pool issuer, signature, expiry, `token_use`, and app-client ID; API Gateway remains a proxy without a second authorizer. Public auth routes are only registration and confirmation; Amplify owns sign-in/session actions.
7. Provision the Tesseract/OpenCV layer and OCR worker Lambda. Person B supplies the backend Lambda/API Gateway and SNS/SES resource definitions and owns the B-specific component stack; integrate those resources with the shared API, queue, and network contracts. Add the shared CloudWatch log groups/alarms/dashboard and secret references. Configure throttling to the documented 50 requests/second steady and 100 requests/second burst limits.
8. Give each Lambda its own execution role with least-privilege access to only the resources it needs. Keep the OCR role limited to its bucket/queue/database/notification access and backend role limited to the backend's resources.

**Files/modules:** SAM resource definitions, IAM policies, security-group rules, S3 bucket policies/CORS, CloudFront OAC config, queue/DLQ config, FastAPI/Cognito contract parameters, secrets/env references, and outputs.

**Test and acceptance:** run SAM/template lint or validation after each resource group; inspect the generated change set before deployment; verify public access is blocked on documents and frontend bucket while CloudFront OAC can read frontend assets; verify RDS is private and only Lambda security groups can reach it; verify private Lambda connectivity, FastAPI's per-pool access-token checks, public registration/confirmation routes, API throttling, queue retry/DLQ settings, and CORS with the configured frontend origin. Confirm regional/account cost assumptions against the free-tier-first constraint before deploying. Use deployed smoke checks for security properties that local validation cannot prove.

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

- Integrate Person B's shared notification module and verified SES sender configuration with the worker. The selected customer SMS path is direct phone delivery through SNS; do not create a customer notification topic. Document SES sandbox verification requirements and the India SMS/DLT limitations noted in Person A's context.
- Follow the selected ownership: worker auto-verification sends after persistence; B sends reviewer-decision notifications to the customer (approval email; rejection email plus generic SMS; re-upload decision email). Do not notify on ordinary submission. Suppress duplicate worker sends. Keep mismatch details in the portal, not SMS.
- Add the documented CloudWatch log groups, metric filters, alarms, and dashboard. Configure alarms at the stated thresholds: any DLQ message, more than 5 Lambda errors in 5 minutes, RDS CPU above 80% for 5 minutes, and more than 10 API 5xx errors in 5 minutes. CloudTrail remains optional/recommended as the source context states.
- Ensure logs include correlation identifiers and status without full OCR text, document bytes, passwords, tokens, or full identity numbers.

**Test and acceptance:** notification unit tests use mocked clients and assert destination/template selection and failure handling; deployed tests use verified sandbox recipients and a safe test number when available. Confirm alarm metrics and log groups are created and a test DLQ message can trigger the expected alarm.

#### A6. Deploy and hand off

- Deploy the shared foundation in dependency order with `sam deploy`; review and approve B's component-stack change set before B provisions it. Run migrations only when Person B supplies the reviewed migration and coordinates the database run.
- Provide Person B the VPC/subnet/security-group references, document bucket, queue URL/ARN and message contract, OCR worker/layer outputs, and region through the agreed handoff. Person B provides A the RDS endpoint/name/port/secret ARN, Cognito IDs, backend API outputs, and SNS/SES configuration.
- Provide Person C the API URL, CloudFront URL/distribution, frontend bucket, region, and CORS origin details. Person B provides Person C the customer/reviewer public Cognito configuration.
- Record deployed resource identifiers and verification evidence in a handoff note without publishing secrets.

### Integration requirements and checkpoints

- **Checkpoint A/B — before worker database writes:** Person B reviews schema/migration and agrees exact columns, enum values, relationships, transaction behavior, and whether worker persistence uses shared models or a stable SQL contract. Run a schema compatibility test against a migrated test database.
- **Checkpoint A/B/C — before upload deployment:** implement the selected trigger path, presigned key shape, content types, SQS payload, status transitions, and one-job-per-attempt behavior. Run an upload-to-queue contract test.
- **Checkpoint A/B — notifications:** Person B's service interface must be importable in both the API and worker deployment packages, or an already-existing equivalent must be used. Test notification ownership per event.
- **Checkpoint A/C — deployment:** verify CloudFront static routes, public API origin/CORS, frontend environment values, and Cognito public config using the actual exported build.

### Final verification and acceptance

- Clean deployment succeeds; documented public auth endpoints and customer/reviewer protected routes behave correctly; presigned upload and private bucket access behave as expected; queue retry and DLQ route work; OCR worker completes sanitized Aadhaar, PAN, and PDF checks; RDS remains private; alarms/logs are present; all outputs match the shared contract.

### Handoff/completion requirements

- Infrastructure source, layer build process, OCR code/tests, deployment/runbook, environment-variable names, migration coordination steps, resource outputs, and known AWS account/demo constraints.
- Evidence of validation and deployed smoke checks; clear distinction between mocked/local checks and AWS-verified checks.
- No uncommitted secrets, temporary documents, unrelated changes, or undocumented manual resource dependencies.

---
