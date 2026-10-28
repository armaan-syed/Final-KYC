# Pramāṇa — Person C Implementation Plan

This is the standalone implementation plan for Person C. It follows the existing assignments in `context/person-a.md`, `context/person-b.md`, `context/person-c.md`, `context/pramana-context.md`, and `context/project.md`; it does not change ownership or add product scope.

## Shared instructions for all implementation agents

1. Inspect the repository, all relevant context files, Git status, existing code, configuration, and available test commands before changing anything. Record unrelated changes and leave them untouched.
2. Keep each change within the existing assignment. Do not introduce additional product flows, services, data fields, roles, or deployment targets.
3. Implement in small stages: **implement → test → inspect results → continue**. A stage is complete only when its tests pass and its acceptance criteria below are met. Add tests with the code; do not postpone them to the end.
4. Use local fakes, fixtures, or SAM local where cloud resources are unavailable. Clearly label what was tested locally versus against deployed AWS resources. Never report a cloud integration as verified if it was only mocked.
5. Never commit AWS credentials, database passwords, real identity documents, or real customer data. Keep local `.env` files ignored; use Secrets Manager and encrypted Lambda configuration for deployed secrets.
6. Keep the existing stack: AWS SAM, S3/CloudFront, API Gateway, Lambda, Cognito, SQS, PostgreSQL/RDS, Tesseract/OpenCV, SNS, SES, and CloudWatch. The frontend remains Next.js/React/TypeScript/Tailwind with Amplify Auth and the existing API.
7. Where the source documents conflict, do not silently implement both behaviors. Resolve the item at the shared contract checkpoint below, record the selected existing behavior in a small integration contract/change note, and make all three implementations and tests match it. Do not treat unresolved contract questions as permission to add a feature.

## Shared contract checkpoint before cross-person integration

The context documents contain several interface disagreements. Each person can proceed on independent work, but the following contracts must be settled and recorded before the affected components are joined. The purpose is to implement the assigned system without duplicate triggers, incompatible schemas, or guessed behavior.

| Contract | What the context says | Required resolution and verification |
|---|---|---|
| Upload-to-OCR queue trigger | Person B and Person C say `POST /kyc/submit` creates the attempt and sends a complete message to SQS. Person A and the architecture diagram also describe an S3 event triggering SQS. | Agree on exactly one enqueue path. The worker message must identify `kyc_attempt_id`, `kyc_case_id`, `customer_id`, `s3_bucket`, `s3_key`, and `document_type`. Test that one successful upload creates one attempt and one OCR job, with no duplicate processing. Do not enable both triggers. |
| KYC status vocabulary | Docs use `REVIEW_REQUIRED`, `REUPLOAD_PENDING`, and `REUPLOAD_REQUESTED` in different places. `REVIEW_REQUIRED` appears in API/attempt examples but is missing from the frontend `KYCStatus` union and the project-level case-status table. | Agree on persisted case statuses, attempt statuses, and API-visible statuses separately; map them explicitly. Update backend enums/schemas and frontend types/badges together. Test each allowed transition and reject unknown values. |
| Authentication entry points | Person B defines `/auth/register`, `/auth/confirm`, `/auth/login`, `/auth/refresh`, `/auth/logout`; Person C's API client includes register/login, while its page notes also call Amplify `signIn()`/`signUp()` directly. | Select one consistent frontend-to-Cognito flow using the already-defined routes and Amplify responsibilities. Ensure registration confirmation, login, refresh, logout, and bearer-token attachment have one owner each. Verify customer and reviewer tokens against their respective pools and clients. |
| Cognito frontend configuration | Person A/B specify separate customer and reviewer user pools; Person C shows a single pool ID/client ID in frontend environment variables. | Define the customer and reviewer public pool/client configuration needed by the two portals. Verify a customer cannot enter reviewer APIs and a reviewer cannot use customer-only APIs. Do not expose secrets in `NEXT_PUBLIC_*` variables. |
| Notification ownership and target | Person A owns AWS SNS/SES resources and describes worker notifications; Person B provides a notification service that Person A imports, while also owning reviewer decisions. The examples differ between publishing to an SNS topic and publishing directly to a phone number. | Agree who invokes the shared notification code for each existing event (automated result versus reviewer decision), how it is packaged for both Lambdas, and whether SMS uses the configured topic or direct phone delivery. Test one notification per state transition, with no duplicate sends. Preserve generic rejection SMS and portal-only rejection detail. |
| Comparison fields and match rule | Aadhaar address is described as optional/lower-weight in Person A's notes; other examples imply all compared fields are required for 100% auto-verification. PAN number is stored but not compared. | Record the exact compared/required field list and how absent OCR fields affect the result. Keep document-specific rules: Aadhaar name/DOB/gender and the documented address rule; PAN name/DOB; PAN identifier is stored. Unit-test exact 100% auto-verify and mismatch-to-review behavior. |
| Static frontend routing | Person C specifies S3/CloudFront static export and also shows Next middleware plus a dynamic `/reviewer/cases/[caseId]` page. Static export does not run Next server middleware and requires a deployable route strategy for dynamic IDs. | Keep the assigned static hosting target. Choose and verify a route-guard and case-detail URL strategy that works in the generated static output and CloudFront. The backend remains the authorization boundary regardless of client route guards. |
| Supported upload formats | Frontend accepts JPEG, PNG, and PDF; the OCR examples preprocess an image with OpenCV. | Retain the formats explicitly accepted by the frontend and verify each through the OCR pipeline, or reconcile the allowed format list before narrowing it. Do not claim PDF support until the worker can process a PDF test fixture. |

When no person can settle a contract from the current context, record the exact question and its blocked integration step for the project owner. Continue unrelated work with a mock of the agreed interface; do not invent a new behavior.

---

## Person C

### Existing assigned responsibility

Own the Next.js customer and reviewer portals, Cognito/Amplify frontend integration, API client and types, direct presigned S3 upload, customer status/history and reviewer decision UI, reusable UI components, and S3/CloudFront deployment.

### Implementation objective

Deliver a responsive, accessible frontend that implements the existing customer and reviewer flows, accurately reflects backend status and error contracts, sends authenticated API requests, uploads directly to private S3 through presigned URLs, and deploys as the assigned static CloudFront site.

### Prerequisites/dependencies

- Inspect existing frontend/repository patterns before creating pages or replacing layouts.
- Receive the API schema/error contract and API URL from Person B; receive CloudFront/bucket and separate Cognito customer/reviewer public configuration from Person A.
- Resolve the auth flow, status vocabulary, dynamic case route/static export behavior, supported upload types, and API authorization contracts before wiring final pages.
- Use only public Cognito IDs, region and API URL in `NEXT_PUBLIC_*`; no AWS credentials or private secrets belong in browser bundles.

### Step-by-step implementation plan

#### C1. Bootstrap and verify the frontend shell

- Create or extend the documented Next.js 14 App Router, React 18, TypeScript, Tailwind structure, preserving any existing design/layout conventions.
- Create root layout, landing/login redirect behavior, navigation, shared error/loading/success components, and responsive foundations.
- Configure static export for S3/CloudFront if consistent with the resolved route strategy.

**Files/modules:** `app/`, shared layouts, `components/shared/`, `next.config.js`, Tailwind and TypeScript config.

**Test and acceptance:** clean install/build/typecheck; route shell renders; no client/server import errors; mobile-width layout does not overflow; generated export contains expected static assets.

#### C2. Implement Cognito auth, API client, and typed contract

- Implement `lib/auth.ts` using Amplify for the agreed customer/reviewer sign-in, registration/confirmation, sign-out, current user and access-token retrieval behavior.
- Configure both user pools/clients where required by the separate customer and reviewer flows. Ensure reviewer accounts are not offered self-registration.
- Implement `lib/api.ts` with the configured API base URL, bearer token on protected requests, and direct unauthenticated calls only for public auth routes. Do not attach an expired/empty token to public auth endpoints.
- Define `lib/types.ts` from Person B's finalized schemas: statuses, document types, decisions, field comparisons, customer, attempt, case, audit, queue and dashboard payloads. Do not maintain a second frontend-only status vocabulary.
- Add user-friendly API error mapping and loading state behavior.

**Test and acceptance:** unit tests cover token attachment/absence, separate customer/reviewer configuration, response parsing, expired/unauthorized responses, and exact enum/request/response shape compatibility. No private values are present in the static bundle.

#### C3. Implement registration, confirmation, and login

- Build `/register` with the documented customer fields and Zod validation aligned to backend constraints.
- Build `/confirm` for Cognito's verification code and `/login` using the chosen auth contract. Keep registration restricted to customers.
- Handle validation errors, duplicate email, invalid confirmation code, wrong password, loading, success and navigation states. Do not expose raw stack traces or API response internals.

**Files/modules:** `app/(auth)/register`, `confirm`, `login`, `components/auth/RegisterForm.tsx`, `LoginForm.tsx`, form schemas.

**Test and acceptance:** component/API tests cover required/optional fields, malformed email/date, password rules, confirmation success/failure, login success/failure and correct landing route. Browser integration confirms a customer can register, confirm and sign in against a test Cognito pool when available.

#### C4. Implement protected customer portal

- Build the customer layout, dashboard, profile view/edit using `GET/PUT /customer/profile`, `/kyc/upload`, and `/kyc/status` pages listed in the context.
- Protect customer routes from unauthenticated users and send reviewer users to their correct portal. Treat route checks as navigation/UI behavior only; API remains responsible for access control.
- Display agreed case/attempt states, current document type/submission date, rejection detail only in the portal, and preserved attempt history.
- Poll `/customer/kyc/status` every 10 seconds only while status is PROCESSING; stop polling after a terminal/review state. Refresh reviewer dashboard counts at the documented 60-second interval.

**Test and acceptance:** component tests cover profile load/update, each status badge, empty/new customer state, loading/error state, attempt ordering, rejection reason visibility, and polling start/stop. Customer A cannot see Customer B's API data even if route IDs or requests are manipulated.

#### C5. Implement presigned document upload

- Implement document type selection, allowed file types (JPEG, PNG, PDF per current frontend context), preview, upload progress, retry/error messaging, and submit state.
- Follow the agreed flow: call `POST /kyc/upload-url`, PUT bytes directly to the returned presigned S3 URL with the required Content-Type, then call `POST /kyc/submit` with the returned key and documented metadata.
- Never route document bytes through the API. Never let the browser choose the bucket or arbitrary S3 key. Preserve a clear recovery state if URL creation, PUT, or submit fails; do not show PROCESSING until submit succeeds.

**Files/modules:** `DocumentUploadForm.tsx`, upload API helper, relevant KYC page and tests.

**Test and acceptance:** mock tests verify ordered API → S3 PUT → submit calls, headers, progress, duplicate-submit prevention, unsupported file rejection, and failure at each stage. Integration test with a test bucket confirms CORS and presigned PUT work; end-to-end test confirms one attempt and one queue job.

#### C6. Implement reviewer portal

- Build reviewer layout, dashboard, paginated review queue, case list/filters, case detail, comparison table, decision form, and audit trail using the context's components and response shapes.
- Case detail shows registered customer fields, document preview through the short-lived GET URL, extracted data, field-level comparisons, attempt history, and audit events.
- Submit only the documented decisions with notes; disable repeated submission while pending and refresh case/queue/dashboard after success. A re-upload request explains the existing next-attempt flow without deleting old data.
- Keep customer and reviewer routes/data separated and preserve the professional internal-review layout described in the context.

**Files/modules:** `app/(reviewer)/...`, `DashboardSummary.tsx`, `ReviewQueueTable.tsx`, `CaseDetailCard.tsx`, `FieldComparisonTable.tsx`, `DecisionForm.tsx`, `AuditTrailList.tsx`.

**Test and acceptance:** component/API tests cover pagination, empty/error queues, exact match/mismatch rendering, missing extracted values, decision notes, disabled repeat action, success refresh, expired document URL, and audit ordering. Unauthorized customer access is denied by backend and handled cleanly by UI.

#### C7. Static deployment and route verification

- Build the static export with the exact deployment environment variables; sync the generated export to Person A's private frontend bucket and invalidate CloudFront.
- Verify all direct links and refreshes for customer and reviewer pages, especially dynamic case detail URLs. Implement only the route-compatible behavior chosen at the shared checkpoint; do not assume Next middleware runs at the CDN.
- Confirm backend CORS allows the deployed CloudFront origin and browser requests include only public config plus tokens.

**Test and acceptance:** production export builds from a clean environment; deployed CloudFront pages and static assets load; login, protected-page navigation, direct case-detail links, API calls, and document preview work on the CDN domain; no build-time secret or local URL remains.

### Integration requirements/checkpoints

- **C/B contract test:** every frontend endpoint, request body, response, status, error code and field name matches FastAPI.
- **C/A auth/CDN test:** customer/reviewer Cognito config, CloudFront hosting, API CORS, route refresh and public frontend variables match the deployed resources.
- **C/B/A upload test:** direct S3 upload with actual Content-Type succeeds, backend accepts the key, one queue event is created, worker status is shown through polling, and failures are recoverable in UI.
- **C/B reviewer test:** queue item opens correct case, preview URL is short-lived, decision persists, audit is visible, and customer status reflects the decision.

### Final verification and acceptance

- Production build and static deployment work; all customer/reviewer pages render without console/runtime errors; forms validate; API auth and errors are handled; upload is direct to S3; status/history and reviewer views reflect real API data; route guards are appropriate for static hosting; backend remains authoritative for security.

### Handoff/completion requirements

- Build/deploy instructions, required public environment variables, page/API mapping, Cognito pool mapping, route strategy, test results, and known browser/CDN constraints. No credentials, customer data, or sample identity documents are included in the frontend bundle/repository.

---
