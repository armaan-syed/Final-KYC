# Admin schema inspection

`pramana-dev-schema-inspector` is a private, IAM-invoked Lambda that returns a fixed PostgreSQL schema report. It does not expose a SQL editor, accept SQL or database identifiers from the caller, return customer rows, or return/log the database secret. Its database connection is read-only and uses the existing RDS TLS CA bundle.

This path requires no EC2 instance, laptop-to-VPC route, VPN, NAT gateway, public RDS address, temporary runner, or post-check cleanup. The Lambda has no idle compute charge; invocations and the small execution-log volume are usage-based.

## Invoke the report

From a workstation with AWS CLI v2 and an authorized AWS identity that can invoke the function:

```bash
aws sts get-caller-identity --profile pramana-iam-session
aws lambda invoke \
  --function-name pramana-dev-schema-inspector \
  --region us-east-1 \
  --profile pramana-iam-session \
  --cli-binary-format raw-in-base64-out \
  --payload '{}' \
  schema-report.json
cat schema-report.json
```

In PowerShell, use the same `aws lambda invoke` arguments and replace the final file name with `schema-report.json`; display it with:

```powershell
Get-Content .\schema-report.json
```

The result contains only:

- The configured database name.
- Alembic revision(s), or an empty list if the revision table is absent.
- The sorted public application table names and count (excluding `alembic_version`).
- The `customers.date_of_birth` PostgreSQL type and nullability, if that column exists.

Expected handoff state is revision `001_initial_schema`, nine application tables, and `customers.date_of_birth` as `date` with `NO` for nullable.

## Interactive psql shell for administrators

The separate stack `pramana-dev-admin-psql-access` is deployed. It created dedicated security group `sg-0d9f74e92a59b0313` with no inbound rules and only outbound TCP 5432 to the existing database security group. The DB security group allows TCP 5432 from this dedicated source group; RDS remains private. No EC2, NAT gateway, or interface endpoint was added. CloudShell's VPC connection has no additional charge; its VPC environment is ephemeral and its home directory is deleted after timeout or deletion ([CloudShell VPC setup](https://docs.aws.amazon.com/cloudshell/latest/userguide/creating-vpc-environment.html), [CloudShell limits](https://docs.aws.amazon.com/cloudshell/latest/userguide/limits.html)).

In the AWS Console, select `us-east-1`, open CloudShell, choose **+ → Create VPC environment**, then select:

- Name: `pramana-admin-psql`
- VPC: `vpc-0f16fa3dea85f7b0d`
- Subnet: `subnet-03c8032601117f445` (`us-east-1b`, same AZ as RDS)
- Security group: `sg-0d9f74e92a59b0313`

In its terminal, check for the preinstalled PostgreSQL client and connect:

```bash
psql --version
psql -W "host=pramana-dev-database-db.citogy2m6wxr.us-east-1.rds.amazonaws.com port=5432 dbname=pramana_kyc user=pramana_app sslmode=require"
```

Enter the database password only at the prompt using the approved credential source. Do not put it in the command, a file, or chat. `sslmode=require` forces encrypted transport; for server-certificate verification, use the AWS RDS CA bundle with `sslmode=verify-full` ([RDS PostgreSQL TLS guide](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html)).

At the `pramana_kyc=>` prompt, run only catalog reads in a read-only transaction:

```sql
BEGIN READ ONLY;
\conninfo
\dt public.*
SELECT version_num FROM public.alembic_version;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'customers'
  AND column_name = 'date_of_birth';
ROLLBACK;
\q
```

The CloudFormation security-group path is deployed, but a human-launched CloudShell VPC session and `psql` login have not yet been tested. The existing fixed-query Lambda report remains the safer way to check schema metadata without opening an interactive SQL session.

## Deploy once or update the inspector

The inspector is a separate CloudFormation stack. This keeps inspection access independent from the shared foundation, backend API, and OCR worker. From the repository root:

```bash
infra/schema_inspector/scripts/prepare_changeset.sh
```

The script verifies the AWS account, reads only the existing foundation outputs and non-secret parameters, builds/uploads the small inspector ZIP, validates the template and security rules, and creates a CloudFormation change set. It does **not** execute the change set. Review every resource change, then execute the printed command. The first deployment creates only the fixed-query Lambda, its execution role, a narrowly scoped invoke policy, a dedicated security group and the corresponding TCP 5432 security-group rules, and a 14-day log group. It does not alter the foundation stack or any Person B/C stack.

To authorize another AWS administrator, have the account IAM administrator attach the output `SchemaInspectorInvokerPolicyArn` to that approved user's IAM identity, role, or admin group. The policy allows only `lambda:InvokeFunction` on this report function. At the 2026-10-30 check, it was not attached to any user, role, or group; `pramana-admin` successfully invoked the report using its existing AWS permissions. IAM authorization is separate from the KYC reviewer role in the web app. Do not grant this AWS permission to ordinary reviewers or customers.

## Security and operation

- Invocation uses AWS IAM authentication through `lambda:InvokeFunction`; there is no Function URL, API Gateway route, or public resource policy.
- The Lambda role can read only the configured RDS secret and write only to its own 14-day CloudWatch log group. It has no S3, SQS, Cognito, SES, SNS, or database write permissions.
- Its dedicated security group allows outbound PostgreSQL only to the database security group and TCP 443 over outbound-only IPv6 for Secrets Manager. The database permits TCP 5432 from this group only for the fixed report Lambda.
- The handler ignores event contents. It runs hard-coded catalog queries inside a read-only PostgreSQL transaction and never queries application/customer rows.
- Errors return generic messages. Logs include only an AWS error code, SQLSTATE, or exception class, never secret contents, query results, or customer data.
- At deployment verification, `pramana-dev-trail` was actively logging in `ap-south-1` as a single-Region trail, with management events enabled and no data resources selected. It does not provide multi-Region coverage for this `us-east-1` function, and Lambda `Invoke` is a data event. The inspector's sanitized Lambda logs are retained for 14 days; this stack does not create a durable invocation audit trail.

## Build the Lambda artifact

After changing the handler or dependency pin, rebuild the ignored SAM source artifact before packaging/deployment:

```bash
infra/schema_inspector/scripts/build.sh
```

The build installs the pinned `psycopg2-binary` wheel for Linux x86_64 / Python 3.12 under `infra/schema_inspector/dist/package`, which is ignored by Git.
