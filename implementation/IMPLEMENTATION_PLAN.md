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

Person A has completed the repository/AWS baseline review and implemented the local OCR parsing, normalization, comparison, and extraction pipeline. The 12 pure-Python tests pass. A first SAM foundation template has been drafted, parsed locally, and checked for resource dependency cycles. The ignored local `.env` is configured for the project default region `us-east-1` and JSON output; its existing credential values were preserved and have not been used. Earlier `aws login` attempts selected the root identity and were not used for AWS calls. The active AWS caller was verified as the non-root IAM user `pramana-admin`; CloudFormation `validate-template` passed in `us-east-1`. No AWS resources have been deployed and no teammate IAM users or policies have been changed. Native OCR validation is blocked by the unavailable Docker daemon, and database/message/queue-trigger contracts remain open.
