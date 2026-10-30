# Person A shared SAM infrastructure

`infra/sam/template.yaml` defines the shared foundation and OCR worker. It currently includes:

- A private VPC with two private subnets, no NAT/EIP/public-subnet resources in the template, private Lambda security groups, and a database security group that accepts PostgreSQL only from the backend and OCR Lambda groups.
- A free S3 gateway endpoint and an egress-only IPv6 Internet Gateway for private subnet outbound HTTPS. NAT and paid interface endpoints are not deployed. A temporary Lambda in the private subnets passed read-only connectivity checks to Secrets Manager, SQS, SNS, Cognito, and SES on 2026-10-29.
- A private, versioned, SSE-S3 document bucket with access logging, TLS-only bucket policy, and CORS for the CloudFront origin.
- A private frontend bucket; CloudFront OAC is conditional and currently disabled pending AWS account verification.
- An encrypted standard OCR queue and DLQ. `POST /kyc/submit` is the only producer; do not add an S3 event trigger.
- The conditional Python 3.12 x86_64 worker, OCR layer, shared notifications/RDS CA layer, partial batch retries, and scoped execution role. `EnableOCRWorker` defaults to `false` until Person B supplies the database secret and SES sender identity.
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

The database security group allows TCP 5432 only from the backend and worker security groups. NAT and public routes have been removed. The VPC has `2600:1f18:4020:8800::/56`; its two private subnets use `2600:1f18:4020:8800::/64` and `2600:1f18:4020:8801::/64`. Both private route tables send IPv6 default traffic through egress-only gateway `eigw-0e03c52bb1008d130`. Lambda security groups limit IPv6 egress to TCP 443; their pre-existing IPv4 default egress has no public IPv4 route in these private subnets. The connectivity probes were superseded by the synthetic deployed workflow recorded below.

### Live release status (2026-10-30)

- `pramana-dev-backend` is deployed at `https://rimait7lg7.execute-api.us-east-1.amazonaws.com/dev`; health and CORS preflight checks pass. A synthetic live API flow passed Cognito access-token auth, presigned upload, SQS, OCR to `REVIEW_REQUIRED`, reviewer decision, customer status, and audit.
- `pramana-dev-foundation` is `UPDATE_COMPLETE`; the OCR worker and SQS event mapping are enabled, using OCR layer v4 and shared layer v7.
- The React/Vite production build was uploaded to the private frontend bucket with SSE-S3. AWS rejected CloudFront creation because the account must be verified before adding CloudFront resources, so the site is not public yet. CORS currently allows `http://localhost:3000`; update it to the CloudFront origin after the distribution exists.
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

Review every future CloudFormation change set before execution. The A-owned template has no NAT resources, and NAT is absent from the deployed stack. Four interface endpoints across two AZs would add about $58.40/month in fixed hourly charges, so retain the verified IPv6 path unless a measured requirement justifies that cost. CloudFront remains disabled pending AWS account verification. Do not change teammate IAM access or commit credentials.
