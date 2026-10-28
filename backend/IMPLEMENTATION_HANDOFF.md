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

- No project workload resources are provisioned. Person A has a reviewed
  CloudFormation change set for `pramana-dev-foundation` in `us-east-1`; it is
  `AVAILABLE` but unexecuted. It proposes two private subnets in distinct AZs,
  a database security group, and one NAT gateway for private egress. The change
  set has Person A's explicit approval, but its concrete VPC, subnet, and
  security-group IDs are not available until execution. Execution is currently
  paused because the CloudFormation compliance validator is unavailable. SAM's
  separate managed artifact bucket holds the staged template/layer packages.
- Read-only inspection found only the default VPC and no RDS instance. The
  proposed new private network is not active until its change set is executed.
  The RDS template inputs (`PrivateSubnetIds`, `DatabaseSecurityGroupId`) match
  Person A's planned outputs and pass AWS CloudFormation `validate-template`
  plus `cfn-lint`. The default `db.t4g.micro` incurs charges; RDS needs its own
  reviewed change set and cost approval. The database's Retain policies mean a
  later stack deletion would leave the database and its charges in place.
- The proposed single NAT gateway provides outbound access for backend AWS
  service calls and Cognito JWKS retrieval. It has ongoing hourly, public IPv4,
  and data-processing charges; both private AZs route through that single-AZ
  gateway. RDS reachability alone is not sufficient, so the egress design must
  be accepted with the foundation change set.
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
- SAM is available in the project virtual environment, and local SAM/template
  validation plus AWS `validate-template` have passed. No RDS migration has
  been applied to AWS; deployed SAM/API and database integration remain
  unverified. The latest test run skipped the PostgreSQL integration check
  because no dedicated database URL was configured; an earlier disposable
  migrated-PostgreSQL integration run passed.
