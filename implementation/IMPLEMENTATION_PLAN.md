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

See the [Person A execution checklist](PERSON_A_IMPLEMENTATION_PLAN.md#person-a-execution-status) and [Person B handoff](../backend/IMPLEMENTATION_HANDOFF.md) for current progress. The shared foundation and B's private RDS stack are deployed; Cognito outputs/configuration are available. A deployed and verified the private IPv6 egress path and reviewed/fixed the FastAPI access-token contract, so these A-owned prerequisites no longer block B. The RDS migration, backend API, and SES sender are still pending B. Current local runs passed 33 backend tests, 33 OCR/worker tests with one optional PostgreSQL test skipped, and 2 frontend tests; `npm run build` passes and generates the static customer/reviewer routes. `npm audit --omit=dev` still reports 3 production vulnerabilities needing C's compatibility review. B's latest pushed commit `cdfeedf` is now on local `master`; A's reconciled changes are validated and ready to push. No secrets or customer data are committed.
