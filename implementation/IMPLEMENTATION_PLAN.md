# Pramāṇa — Implementation Plan Index

The work is split into three standalone plans, one for each existing assignment. Use the project integration plan to coordinate contracts and verify the complete application. All plans are based on the context documents in `context/` and preserve the assigned ownership.

## Individual implementation plans

- [Person A — AWS infrastructure, OCR pipeline, security, and deployment](PERSON_A_IMPLEMENTATION_PLAN.md)
- [Person B — FastAPI backend, PostgreSQL schema, verification integration, and Cognito auth](PERSON_B_IMPLEMENTATION_PLAN.md)
- [Person C — customer and reviewer frontend portals](PERSON_C_IMPLEMENTATION_PLAN.md)

## Shared integration plan

- [Final project integration and end-to-end verification](FINAL_PROJECT_INTEGRATION.md)

## Person A execution note — 2026-10-29

Person A confirms Person B and Person C are 100% trusted teammates. Their existing AWS `AdministratorAccess` must remain unchanged during Person A's implementation. Person A will remove their access manually after the implementation; do not modify either teammate's AWS access as part of this work.

See the [Person A execution checklist](PERSON_A_IMPLEMENTATION_PLAN.md#person-a-execution-status) and [Person B handoff](../backend/IMPLEMENTATION_HANDOFF.md) for current progress. The shared foundation and B's private RDS/Cognito resources are deployed. A's no-NAT IPv6 egress and access-token contract work are on `master`; the private network probe passed and its temporary stack, Lambda, and role are now deleted. On `2b9f5ea`, backend tests pass (33), OCR/worker tests pass (33; the optional database test was also run separately and passed after the actual Alembic migration on a disposable PostgreSQL 16 instance), and frontend tests pass (2); the static build and 10 local route checks pass. `npm audit --omit=dev` reports 3 findings for C to assess. Live RDS is private/encrypted/available, but its migration/catalog is unverified; there is no deployed API, worker, verified SES sender, or CloudFront distribution. B's migration/API/notification configuration, C's deployed integration, A's worker deployment/review, and AWS account verification still block the deployed end-to-end workflow. No secrets or customer data are committed.
