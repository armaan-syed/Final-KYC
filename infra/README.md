# Person A shared SAM infrastructure

`infra/sam/template.yaml` defines the shared foundation and OCR worker. It currently includes:

- A private VPC with two private subnets and no NAT gateway by default, private Lambda security groups, and a database security group that accepts PostgreSQL only from the backend and OCR Lambda groups.
- A free S3 gateway endpoint. No interface endpoints are deployed yet; private backend/worker calls to Secrets Manager, SQS, SNS, SES, and Cognito need the corresponding approved endpoints before cloud runtime integration.
- A private, versioned, SSE-S3 document bucket with access logging, TLS-only bucket policy, and CORS for the CloudFront origin.
- A private frontend bucket; CloudFront OAC is conditional and currently disabled pending AWS account verification.
- An encrypted standard OCR queue and DLQ. `POST /kyc/submit` is the only producer; do not add an S3 event trigger.
- The conditional Python 3.12 x86_64 worker, OCR layer, shared notifications/RDS CA layer, partial batch retries, and scoped execution role. `EnableOCRWorker` defaults to `false` until Person B supplies the database secret and SES sender identity.
- CloudWatch alarms for DLQ depth, worker errors, optional RDS CPU and API 5xx metrics, plus an operations dashboard.

Person B owns Cognito pools, RDS and its secret, the FastAPI/API Gateway component, and notification provider configuration. `backend/template.yaml` consumes outputs from the shared stack. The A-owned foundation is deployed; it does not create B-owned RDS, Cognito, backend/API, or customer notification resources. Person B and Person C's existing AWS access has not been changed.

### Current Person B network handoff

- VPC: `vpc-0f16fa3dea85f7b0d`
- Private subnet A: `subnet-0e45971a48d73a18a` (`us-east-1a`)
- Private subnet B: `subnet-03c8032601117f445` (`us-east-1b`)
- Database security group: `sg-02235e74a0e910c37`
- Backend Lambda security group: `sg-02823dd2442632bed`
- OCR worker security group: `sg-0751ba5b887acb41c`

The database security group allows TCP 5432 only from the backend and worker security groups. NAT and public routes have been removed. Person B can proceed with private RDS; private Lambda SDK calls need service endpoints before AWS cloud integration.

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

The current root template passes basic `sam validate`, `cfn-lint` 1.58.0 with W1030 excluded for caller-supplied ARN `String` parameters, and AWS `validate-template`. The deployed no-NAT update was reviewed and executed as a CloudFormation change set. `cfn-guard` was installed and used to scan the original deployment scope. The current AWS resource state and change-set evidence are recorded in `implementation/PERSON_A_IMPLEMENTATION_PLAN.md`.

The current Lambda-runtime worker proof passed on synthetic PAN/Aadhaar images and Aadhaar PDF. Combined code/layers are 258,176,462 bytes (3,967,538 bytes below the 262,144,000-byte quota); the 93,834,078-byte layer ZIP must be uploaded through S3. Keep this narrow size margin in view when dependencies or SAM packaging change.

## Deployment review gate

Review every future CloudFormation change set before execution. NAT is disabled by default and has been removed from the deployed stack; interface endpoints also have hourly charges, so add only the services and AZs required for an agreed runtime path. CloudFront remains disabled pending AWS account verification. Do not change teammate IAM access or commit credentials.
