# Person A shared SAM infrastructure

The project infrastructure includes the shared foundation and OCR worker in `infra/sam/template.yaml`, plus the separately deployed read-only schema inspector in `infra/schema_inspector/template.yaml`:

- A private VPC with two private subnets, no NAT/EIP/public-subnet resources in the template, private Lambda security groups, and a database security group that accepts PostgreSQL only from the backend, OCR worker, and fixed-query schema inspector groups.
- A free S3 gateway endpoint and an egress-only IPv6 Internet Gateway for private subnet outbound HTTPS. NAT and paid interface endpoints are not deployed. A temporary Lambda in the private subnets passed read-only connectivity checks to Secrets Manager, SQS, SNS, Cognito, and SES on 2026-10-29.
- A private, versioned, SSE-S3 document bucket with access logging, TLS-only bucket policy, and CORS for the CloudFront origin.
- A private frontend bucket served through CloudFront OAC. The distribution is enabled and deployed at `https://d231rykprgnarh.cloudfront.net`.
- An encrypted standard OCR queue and DLQ. `POST /kyc/submit` is the only producer; do not add an S3 event trigger.
- The conditional Python 3.12 x86_64 worker, OCR layer, shared notifications/RDS CA layer, partial batch retries, and scoped execution role. `EnableOCRWorker` defaults to `false` until Person B supplies the database secret and SES sender identity.
- An on-demand Python 3.12 schema inspector. It is invoked through the IAM-authenticated Lambda API, uses a dedicated security group, runs fixed read-only catalog queries, and returns no customer rows or credentials. It creates no EC2 instance, public API, or persistent database login.
- CloudWatch alarms for DLQ depth, worker errors, optional RDS CPU and API 5xx metrics, plus an operations dashboard.

Person B owns Cognito pools, RDS and its secret, the FastAPI/API Gateway component, and notification provider configuration. `backend/template.yaml` consumes outputs from the shared stack. The A-owned foundation is deployed; it does not create B-owned RDS, Cognito, backend/API, or customer notification resources. Person B and Person C's existing AWS access has not been changed.

`backend/template.yaml` requires the shared notifications/RDS CA layer ARN as `SharedNotificationsLayerArn`. The foundation exports the current version as the `SharedNotificationsLayerArn` stack output. Older layer versions are retained when a new version is published so a backend deployment that still references an earlier ARN is not broken.

When enabling the OCR worker, pass Person B's live private RDS endpoint as `RDSHost`. The managed database secret supplies credentials; the worker uses the configured endpoint when the secret has no `host` field, and uses the secret host if present.

### Current Person B network handoff

- VPC: `vpc-0f16fa3dea85f7b0d`
- Private subnet A: `subnet-0e45971a48d73a18a` (`us-east-1a`)
- Private subnet B: `subnet-03c8032601117f445` (`us-east-1b`)
- Database security group: `sg-02235e74a0e910c37`
- Backend Lambda security group: `sg-02823dd2442632bed`
- OCR worker security group: `sg-0751ba5b887acb41c`

The database security group allows TCP 5432 only from the backend, worker, and dedicated schema-inspector security groups. NAT and public routes have been removed. The VPC has `2600:1f18:4020:8800::/56`; its two private subnets use `2600:1f18:4020:8800::/64` and `2600:1f18:4020:8801::/64`. Both private route tables send IPv6 default traffic through egress-only gateway `eigw-0e03c52bb1008d130`. Lambda security groups limit IPv6 egress to TCP 443; their pre-existing IPv4 default egress has no public IPv4 route in these private subnets. The connectivity probes were superseded by the synthetic deployed workflow recorded below.

### Persistent read-only schema report

Use the IAM-invoked `pramana-dev-schema-inspector` Lambda to check the live migration revision, application table names, and `customers.date_of_birth` type. It runs inside the existing private subnets, reads the configured database secret only in memory, verifies the RDS TLS certificate, and executes fixed catalog `SELECT` queries in a read-only transaction. It has no Function URL or API Gateway route, and it does not return or log database credentials or customer rows. There is no EC2, VPN, NAT, or temporary runner to clean up. Lambda has no idle compute charge; normal per-invocation and small CloudWatch log usage applies.

Build its Python 3.12 package and invoke it as described in [the admin schema-inspection guide](../implementation/SCHEMA_INSPECTOR.md).

### Live release status (2026-10-30)

- `pramana-dev-backend` is deployed at `https://rimait7lg7.execute-api.us-east-1.amazonaws.com/dev`; health and CORS preflight checks pass. A synthetic live API flow passed Cognito access-token auth, presigned upload, SQS, OCR to `REVIEW_REQUIRED`, reviewer decision, customer status, and audit.
- `pramana-dev-foundation` is `UPDATE_COMPLETE`; the OCR worker and SQS event mapping are enabled, using OCR layer v4 and shared layer v7.
- CloudFront distribution `EMNA2N11641KK` is enabled and deployed at `https://d231rykprgnarh.cloudfront.net` (`PriceClass_100`). The private S3 frontend bucket is reachable through OAC only. Root, HTTPS redirect, asset, and SPA fallback smoke checks passed. Document-bucket CORS allows the CloudFront origin. Backend change set `cloudfront-cors-20261030` now configures API CORS for both `https://d231rykprgnarh.cloudfront.net` and `http://localhost:3000`; live preflight requests for customer profile and KYC status return 200 with the expected CloudFront allow-origin header.
- CloudFront is on usage-based pricing with no per-distribution hourly charge. AWS currently lists 1 TB data transfer and 10 million requests per month across the account in its CloudFront Free Tier; usage beyond that is charged at standard rates. Monitor account-level CloudFront usage in Billing/CloudFront before sharing the site broadly: [CloudFront pricing FAQ](https://aws.amazon.com/cloudfront/faqs/).
- The synthetic `.invalid` email attempt was rejected and audited; no real email or SMS was delivered. SES production access and the SNS SMS service subscription remain unavailable, so real notification delivery is not verified.

## Build and validate locally

Build the Lambda-compatible OCR and shared layers before running SAM build/package. The layer script builds its native dependencies in Amazon Linux 2023 and runs the OCR pipeline and actual worker path in the Python 3.12 Lambda runtime image. If the active Buildx builder needs host networking, set its name explicitly:

```bash
DOCKER_BUILDER=<host-network-buildx-builder> \
DOCKER_BUILD_NETWORK=host \
infra/ocr/scripts/build_layer.sh
```

The build writes ignored artifacts under `infra/ocr/dist/` and `infra/shared/dist/`. SAM packaging uploads the large OCR layer through S3 when needed; do not try to upload its ZIP directly if it exceeds the direct-upload size limit.

Run the local suites from the repository root:

```bash
PYTHONPATH=infra/ocr/src:infra/shared/python \
  .venv/bin/pytest infra/ocr/tests -q
PYTHONPATH=backend:infra/shared/python \
  .venv/bin/pytest backend/tests -q
```

Run template lint after changing the SAM/CloudFormation files:

```bash
cfn-lint -i W1030 -- infra/sam/template.yaml backend/template.yaml
```

W1030 is excluded because these templates accept existing secret/sender ARNs as caller-supplied `String` parameters; their allowed patterns constrain the ARN formats.

The optional PostgreSQL integration test requires a dedicated, migrated test database and `PRAMANA_TEST_DATABASE_URL`. It creates and removes rows with fresh UUIDs. Never point it at a shared or production database.

The root template passes `sam validate`, `cfn-lint` 1.58.0 with W1030 excluded for caller-supplied ARN `String` parameters, and AWS `validate-template`. The no-NAT source is deployed to `pramana-dev-foundation`; the deployed template has no NAT/EIP/public-subnet resources or `EnableNatGateway` parameter. Its latest reviewed change set only narrowed the S3 gateway endpoint policy, with no additions or replacements. CloudFormation drift detection reports `IN_SYNC` with zero drifted resources. `cfn-guard` was used for the focused network rules. Current AWS resource state and change-set evidence are in `implementation/PERSON_A_IMPLEMENTATION_PLAN.md`.

The current Lambda-runtime worker proof passed on synthetic PAN/Aadhaar images and Aadhaar PDF. Combined code/layers are 258,176,462 bytes (3,967,538 bytes below the 262,144,000-byte quota); the 93,834,078-byte layer ZIP must be uploaded through S3. Keep this narrow size margin in view when dependencies or SAM packaging change.

## Deployment review gate

Review every future CloudFormation change set before execution. The A-owned template has no NAT resources, and NAT is absent from the deployed stack. Four interface endpoints across two AZs would add about $58.40/month in fixed hourly charges, so retain the verified IPv6 path unless a measured requirement justifies that cost. CloudFront is active at `https://d231rykprgnarh.cloudfront.net`; the distribution uses `PriceClass_100`. Do not change teammate IAM access or commit credentials.
