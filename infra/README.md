# Person A shared SAM infrastructure

`sam/template.yaml` defines the shared foundation and OCR worker. It currently includes:

- A private VPC with two private subnets, a single NAT gateway, private Lambda security groups, and a database security group that accepts PostgreSQL only from the backend and OCR Lambda groups.
- A private, versioned, SSE-S3 document bucket with access logging, TLS-only bucket policy, and CORS for the CloudFront origin.
- A private frontend bucket behind CloudFront OAC.
- An encrypted standard OCR queue and DLQ. `POST /kyc/submit` is the only producer; do not add an S3 event trigger.
- The conditional Python 3.12 x86_64 worker, OCR layer, shared notifications/RDS CA layer, partial batch retries, and scoped execution role. `EnableOCRWorker` defaults to `false` until Person B supplies the database secret and SES sender identity.
- CloudWatch alarms for DLQ depth, worker errors, optional RDS CPU and API 5xx metrics, plus an operations dashboard.

Person B owns Cognito pools, RDS and its secret, the FastAPI/API Gateway component, and notification provider configuration. `backend/template.yaml` consumes outputs from the shared stack. No AWS resources have been deployed. Person B and Person C's existing AWS access has not been changed.

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
cfn-lint infra/sam/template.yaml backend/template.yaml -i W1030
```

W1030 is excluded because these templates accept existing secret/sender ARNs as caller-supplied `String` parameters; their allowed patterns constrain the ARN formats.

The optional PostgreSQL integration test requires a dedicated, migrated test database and `PRAMANA_TEST_DATABASE_URL`. It creates and removes rows with fresh UUIDs. Never point it at a shared or production database.

The current root and backend templates pass basic `sam validate` and `cfn-lint` 1.58.0 with W1030 excluded for caller-supplied ARN `String` parameters. A containerized `sam build` of the current root template succeeds. AWS `validate-template`, `cfn-guard`, and deployed-resource checks remain pending; the initial, smaller template's historical AWS validation does not cover the current templates.

The current Lambda-runtime worker proof passed on synthetic PAN/Aadhaar images and Aadhaar PDF. Combined code/layers are 258,176,462 bytes (3,967,538 bytes below the 262,144,000-byte quota); the 93,834,078-byte layer ZIP must be uploaded through S3. Keep this narrow size margin in view when dependencies or SAM packaging change.

## Deployment review gate

Do not deploy until Person A reviews account-specific costs and the concrete CloudFormation change set. The single NAT gateway and CloudFront distribution are billable; the NAT gateway is a deliberate single-AZ availability tradeoff. No stack has been created. Do not change teammate IAM access or commit credentials.
