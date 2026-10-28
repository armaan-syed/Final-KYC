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

See the [Person A execution checklist](PERSON_A_IMPLEMENTATION_PLAN.md#person-a-execution-status) for completed work and remaining tasks. Person B's latest commit and Person A's work are pushed to `origin/master` at `960de6f`. Current local runs passed 16 backend tests and 28 OCR/worker tests; one PostgreSQL integration test skipped because no dedicated test database URL is configured (a prior disposable migrated-PostgreSQL integration run passed). Root, backend, and Person B's RDS templates pass AWS CloudFormation `validate-template`; the foundation change set is reviewed and available but unexecuted. No project workload resources are deployed. SAM's artifact bucket and staged deployment objects exist. Person B/C access has not been changed.
