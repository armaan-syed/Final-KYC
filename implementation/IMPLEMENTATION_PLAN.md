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

See the [Person A execution checklist](PERSON_A_IMPLEMENTATION_PLAN.md#person-a-execution-status) and [Person B handoff](../backend/IMPLEMENTATION_HANDOFF.md) for current progress. The shared foundation is deployed at `pramana-dev-foundation`; Person B's private RDS stack is deployed at `pramana-dev-database`, and Cognito outputs/configuration are available. The database migration and API are still blocked by missing private service endpoints and the SES sender identity. Current local runs passed 19 backend tests and 28 OCR/worker tests with one optional PostgreSQL test skipped. AWS CloudFormation `validate-template` passes for the current B database/backend templates. Person B's latest changes are local and uncommitted; no secrets or customer data are committed.
