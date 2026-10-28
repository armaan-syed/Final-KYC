# Person B work handoff (B1, B5, B6, B7)

## Implemented locally

- **B1 — Configuration:** database credentials are no longer defaulted to a
  shared `changeme` value; settings require either local `RDS_PASSWORD` or
  deployed `RDS_SECRET_ARN`. Secrets Manager JSON is fetched for deployed
  configuration, and SQLAlchemy URLs safely escape special characters.
- **B5 — Reviewer APIs:** dashboard counts use UTC-day boundaries, case-list
  filters are constrained to documented status values, case detail eager-loads
  attempt relations, and reviewer decisions serialize on the case row to avoid
  concurrent valid decisions. Attempt history includes attempt IDs.
- **B6 — Notifications:** email HTML values are escaped; provider failures are
  logged without recipient/message data; a decision commits before external
  sends; each send attempt is appended to audit with only channel and provider
  acceptance (not personal data or message content).
- **B7 — Deployment component:** the backend template now expects the shared
  private network and queue/database outputs and uses scoped secret/SQS/S3/SES
  permissions. `infrastructure/database.yaml` defines a private encrypted RDS
  instance with RDS-managed credentials in Secrets Manager.
- Added focused tests for settings, database URL/secret handling, reviewer
  query/decision behavior, and notification templates/provider errors.

## Explicitly not deployed / still needs coordination

- No AWS resource was created or changed. RDS deployment needs Person A's
  reviewed VPC/private subnet IDs and database security-group reference, plus
  the approved stack change set. The template default `db.t4g.micro` is a
  non-zero-cost choice and must be accepted before deployment.
- Read-only inspection in `us-east-1` found no active CloudFormation stacks or
  RDS instances; the only VPC is the default VPC, whose route table has an
  Internet Gateway default route. It is not the reviewed private network this
  database is supposed to use.
- Person A's private Lambda subnets also need approved egress (NAT and/or VPC
  endpoints) for the backend's AWS service calls and Cognito JWKS retrieval;
  RDS reachability alone is not sufficient.
- The API/worker notification contract is unresolved: direct-to-phone SMS in
  the current service versus publishing through an SNS topic, and which
  component sends automated-result notifications. Do not integrate the worker
  until A/B record those choices. The current API template's topic-scoped SNS
  permission does not authorize the service's direct-to-phone call, so this
  permission must be reconciled before deployment.
- The shared root SAM/API Gateway authorizer boundary is not settled. The
  backend template is a component template and must be incorporated once into
  the approved root stack, not deployed as a parallel API/network stack.
- Notification audit records distinguish provider acceptance from final
  delivery. The external-provider/database crash window remains non-atomic;
  this does not claim exactly-once delivery.
- `sam` is not installed in this workspace, and no PostgreSQL test server is
  available. SAM/CloudFormation validation, migration execution, and AWS
  integration remain unverified.
