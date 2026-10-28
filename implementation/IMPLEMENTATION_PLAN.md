# Pramāṇa — Implementation Plan Index

The work is split into three standalone plans, one for each existing assignment. Use the project integration plan to coordinate contracts and verify the complete application. All plans are based on the context documents in `context/` and preserve the assigned ownership.

## Individual implementation plans

- [Person A — AWS infrastructure, OCR pipeline, security, and deployment](PERSON_A_IMPLEMENTATION_PLAN.md)
- [Person B — FastAPI backend, PostgreSQL schema, verification integration, and Cognito auth](PERSON_B_IMPLEMENTATION_PLAN.md)
- [Person C — customer and reviewer frontend portals](PERSON_C_IMPLEMENTATION_PLAN.md)

## Shared integration plan

- [Final project integration and end-to-end verification](FINAL_PROJECT_INTEGRATION.md)

## Person A execution note — 2026-10-28

Person A confirms Person B and Person C are 100% trusted teammates. Their existing AWS `AdministratorAccess` must remain unchanged during Person A's implementation. Person A will remove their access manually after the implementation; do not modify either teammate's AWS access as part of this work.

See the [Person A execution checklist](PERSON_A_IMPLEMENTATION_PLAN.md#person-a-execution-status) for completed work and remaining tasks. The local OCR code and 12 Python tests are complete; the initial SAM foundation passes CloudFormation `validate-template` in `us-east-1`. Native OCR runtime validation is blocked by the unavailable Docker daemon, and the remaining infrastructure and worker integration depend on open shared contracts. No AWS resources have been deployed, and Person B/C access has not been changed.
