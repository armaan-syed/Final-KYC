# Person B implementation and deployment checkpoint

## Completed

- Backend configuration, routes, schemas, SQLAlchemy models, Alembic migration,
  S3 presigned upload/download, SQS producer, reviewer decisions/audit, and
  shared notification adapter are implemented.
- Reviewer dashboard uses UTC-day counts; decision changes are serialized; HTML
  email content is escaped; provider failures avoid recipient/message logging.
- Customer/reviewer Cognito pools and public clients already existed in the
  account. Their outputs are in [`COGNITO_OUTPUTS.md`](COGNITO_OUTPUTS.md).
  Reviewer self-registration is disabled. The customer pool now has the custom
  attributes required by the registration API; `gender` uses Cognito's standard
  attribute. The customer app client now allows the API's password-auth flow.
- Private PostgreSQL was deployed in CloudFormation stack
  `pramana-dev-database` using Person A's private network. It is PostgreSQL
  18.3, `db.t4g.micro`, 20 GiB, encrypted, single-AZ, non-public, with one-day
  automated backup retention and RDS-managed credentials in Secrets Manager.
  The first create attempt was rejected because seven-day backups exceed this
  account's Free Plan limit; the template now uses one day and omits storage
  autoscaling. The failed empty stack was cleaned up before the successful
  deployment.
- RDS outputs, Cognito identifiers, and the shared layer ARN are recorded in
  [`../implementation/PERSON_A_B_WORK_SPLIT.md`](../implementation/PERSON_A_B_WORK_SPLIT.md).
- Backend unit suite: **19 passed**. AWS CloudFormation `validate-template`
  passed for the database component. Live RDS properties and the secret ARN
  were verified without retrieving or printing the secret value.

## Still blocked / outstanding

- **Migration not applied:** the RDS endpoint is private and the developer
  workstation has no VPC route. A migration runner in the private subnets must
  retrieve its secret and connect to PostgreSQL.
- **Person A network dependency:** the deployed VPC has no NAT and only the S3
  gateway endpoint. Private Lambda calls to Secrets Manager, SQS, SNS, SES, and
  Cognito/JWKS need Person A's approved interface-endpoint design. Person A owns
  this networking work; do not add endpoints or NAT from the B component. The
  Person A plan estimates about `$65.70/month` fixed plus data for its proposed
  multi-AZ endpoint design; verify current pricing before approval.
- **Backend/API not deployed:** first apply the migration, then deploy the
  reviewed B API component. The shared layer already exists as
  `arn:aws:lambda:us-east-1:682197558335:layer:pramana-dev-shared-notifications:2`;
  the B template now consumes it rather than creating a duplicate. API Gateway
  authorizer versus FastAPI-only authorization still needs Person A's agreement
  and stack review.
- **SES sender pending:** the account has no verified email identities. Supply
  an approved sender email or domain and complete SES verification/access setup
  before deploying email notifications. Customer SMS uses direct-to-phone SNS
  through the shared module; the alarm SNS topic is not a customer topic.
- **Full integration pending:** OCR worker and CloudFront remain disabled in
  Person A's stack. A/B/C still need the deployed API → upload → SQS → worker →
  database → status → reviewer/notification checks, plus the final status and
  auth handoff with Person C.
- The existing Cognito pools are outside the CloudFormation stacks. Avoid
  replacement pools; coordinate future stack import/ownership with Person A.
- The DB stack has `DeletionPolicy: Retain`; deleting its stack will leave the
  database and its charges in place. Do not delete the database without an
  explicit data-retention decision.

No database password, Cognito user credentials, real identity documents, or
customer data are recorded in this handoff.
