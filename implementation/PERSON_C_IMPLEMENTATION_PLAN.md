# Pramāṇa — Person C Implementation Plan

This is the standalone implementation plan for Person C. It follows the existing assignments in `context/person-a.md`, `context/person-b.md`, `context/person-c.md`, `context/pramana-context.md`, and `context/project.md`; it does not change ownership or add product scope.

## Shared instructions for all implementation agents

1. Inspect the repository, all relevant context files, Git status, existing code, configuration, and available test commands before changing anything. Record unrelated changes and leave them untouched.
2. Keep each change within the existing assignment. Do not introduce additional product flows, services, data fields, roles, or deployment targets.
3. Implement in small stages: **implement → test → inspect results → continue**. A stage is complete only when its tests pass and its acceptance criteria below are met. Add tests with the code; do not postpone them to the end.
4. Use local fakes, fixtures, or SAM local where cloud resources are unavailable. Clearly label what was tested locally versus against deployed AWS resources. Never report a cloud integration as verified if it was only mocked.
5. Never commit AWS credentials, database passwords, real identity documents, or real customer data. Keep local `.env` files ignored; use Secrets Manager and encrypted Lambda configuration for deployed secrets.
6. Keep the existing stack: AWS SAM, S3/CloudFront, API Gateway, Lambda, Cognito, SQS, PostgreSQL/RDS, Tesseract/OpenCV, SNS, SES, and CloudWatch. The current frontend is React + Vite + TypeScript/Tailwind with Amplify Auth and the existing API.
7. Where the source documents conflict, do not silently implement both behaviors. Resolve the item at the shared contract checkpoint below, record the selected existing behavior in a small integration contract/change note, and make all three implementations and tests match it. Do not treat unresolved contract questions as permission to add a feature.

## Shared integration contract and current handoff

The selected cross-person behavior is documented in [`INTEGRATION_DECISIONS_2026-10-29.md`](INTEGRATION_DECISIONS_2026-10-29.md). It supersedes the earlier unresolved contract table below; no design vote is pending.

Current integration source uses Cognito Amplify SRP for customer/reviewer sign-in and sessions, with backend `/auth/register` and `/auth/confirm` for customer registration/profile creation. The frontend sends the Cognito access token to FastAPI. Case and attempt statuses are distinct; use the values and polling rules in the linked contract. Upload limits are JPEG/PNG/PDF, 10 MiB, and 3 PDF pages. Customer status should stop polling outside `PROCESSING` and expose `REVIEW_REQUIRED` for action. Static reviewer case details use the query-string route; the backend remains the authorization boundary.

The master frontend is React + Vite; this plan's setup and deployment steps have been aligned to the active toolchain. The current source has API-backed registration/confirmation, Cognito `given_name` mapping, Amplify sign-in/session handling, customer/reviewer routes, direct S3 upload, and reviewer audit views.

Live frontend check on 2026-10-30: **5 tests passed**, the production `npm run build` passed with mocks disabled and the deployed API/Cognito public configuration, and `npm audit --omit=dev` reported **0 vulnerabilities**. The Vite preview returned HTTP 200 for `/`, `/register`, `/dashboard`, `/reviewer/dashboard`, `/reviewer/queue`, and the query-string reviewer detail route. Production assets are uploaded to the private, SSE-S3 frontend bucket. A separate synthetic live API workflow verified Cognito customer/reviewer access tokens, upload, OCR, reviewer decision, status, and audit; it did not exercise the browser UI or registration/confirmation. The site is not browser-accessible yet because CloudFront creation is blocked by AWS account verification. API/document CORS must change from `http://localhost:3000` to the CloudFront origin after that distribution exists.

Remaining C work is live browser verification of customer registration/confirmation, customer/reviewer sign-in, upload, status, and audit against the deployed API after CloudFront and the final CORS origin are available. The frontend is built and stored privately, not publicly deployed.

## Person C

### Existing assigned responsibility

Own the React customer and reviewer portals, Cognito/Amplify frontend integration using the pool/client configuration supplied by Person B, API client and types, direct presigned S3 upload, customer status/history and reviewer decision UI, reusable UI components, and S3/CloudFront deployment.

### Implementation objective

Deliver a responsive, accessible frontend that implements the existing customer and reviewer flows, accurately reflects backend status and error contracts, sends authenticated API requests, uploads directly to private S3 through presigned URLs, and deploys as the assigned static CloudFront site.

### Prerequisites/dependencies

- Inspect existing frontend/repository patterns before creating pages or replacing layouts.
- Receive the API schema/error contract, API URL, and separate Cognito customer/reviewer public configuration from Person B; receive CloudFront and hosting-bucket details from Person A.
- Resolve the auth flow, status vocabulary, dynamic case route/static export behavior, supported upload types, and API authorization contracts before wiring final pages.
- Use only public Cognito IDs, region and API URL in `VITE_*`; no AWS credentials or private secrets belong in browser bundles.

### Step-by-step implementation plan

#### C1. Bootstrap and verify the frontend shell

- Create or extend the existing React 18, Vite, TypeScript and Tailwind structure, preserving the current design/layout conventions.
- Create root layout, landing/login redirect behavior, navigation, shared error/loading/success components, and responsive foundations.
- Run `npm run build` to type-check and produce the static `dist/` directory for S3/CloudFront.

**Files/modules:** `src/`, shared layouts, components, `vite.config.ts`, Tailwind and TypeScript config.

**Test and acceptance:** clean install/build/typecheck; route shell renders; no client/server import errors; mobile-width layout does not overflow; generated export contains expected static assets.

#### C2. Implement Cognito auth, API client, and typed contract

- Implement `lib/auth.ts` using Amplify for customer/reviewer SRP sign-in, session refresh/sign-out, and access-token retrieval. Registration and confirmation must go through the backend so confirmation creates the RDS customer row.
- Configure both user pools/clients where required by the separate customer and reviewer flows. Ensure reviewer accounts are not offered self-registration.
- Implement `lib/api.ts` with the configured API base URL, bearer access token on protected requests, and unauthenticated `POST /auth/register` and `POST /auth/confirm` calls. Do not add a backend login/refresh/logout call.
- Define `lib/types.ts` from Person B's finalized schemas: statuses, document types, decisions, field comparisons, customer, attempt, case, audit, queue and dashboard payloads. Do not maintain a second frontend-only status vocabulary.
- Add user-friendly API error mapping and loading state behavior.

**Test and acceptance:** unit tests cover token attachment/absence, separate customer/reviewer configuration, response parsing, expired/unauthorized responses, and exact enum/request/response shape compatibility. No private values are present in the static bundle.

#### C3. Implement registration, confirmation, and login

- Build `/register` with the documented customer fields using React Hook Form and Zod validation aligned to backend constraints; submit through `apiRegister`.
- Build `/confirm` using `apiConfirm` with the Cognito verification code, then direct the customer to Amplify sign-in. Keep registration restricted to customers and reviewer self-registration disabled.
- Handle validation errors, duplicate email, invalid confirmation code, wrong password, loading, success and navigation states. Do not expose raw stack traces or API response internals.

**Files/modules:** `app/(auth)/register`, `confirm`, `login`, `components/auth/RegisterForm.tsx`, `LoginForm.tsx`, form schemas.

**Test and acceptance:** component/API tests cover required/optional fields, malformed email/date, password rules, confirmation success/failure, login success/failure and correct landing route. Browser integration confirms a customer can register, confirm and sign in against a test Cognito pool when available.

#### C4. Implement protected customer portal

- Build the customer layout, dashboard, profile view/edit using `GET/PUT /customer/profile`, `/kyc/upload`, and `/kyc/status` pages listed in the context.
- Protect customer routes from unauthenticated users and send reviewer users to their correct portal. Treat route checks as navigation/UI behavior only; API remains responsible for access control.
- Display agreed case/attempt states, current document type/submission date, rejection detail only in the portal, and preserved attempt history.
- Use React Query for API-backed loading, caching, and refresh behavior. Poll `/customer/kyc/status` every 10 seconds only while status is PROCESSING; stop polling after a terminal/review state. Refresh reviewer dashboard counts at the documented 60-second interval.

**Test and acceptance:** component tests cover profile load/update, each status badge, empty/new customer state, loading/error state, attempt ordering, rejection reason visibility, and polling start/stop. Customer A cannot see Customer B's API data even if route IDs or requests are manipulated.

#### C5. Implement presigned document upload

- Implement document type selection, allowed file types (JPEG, PNG, PDF), 10 MiB client-side size cap, 3-page PDF cap, preview, upload progress, retry/error messaging, and submit state.
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
- Verify all direct links and refreshes for customer and reviewer pages. Use the static detail page/query-parameter route agreed at the shared checkpoint for case IDs; do not depend on server-side routing or arbitrary dynamic route generation.
- Confirm backend CORS allows the deployed CloudFront origin and browser requests include only public config plus tokens.

**Test and acceptance:** `npm run build` produces the expected `dist/` tree from a clean environment; deployed CloudFront pages and static assets load; login, protected-page navigation, direct query-based case-detail links, API calls, and document preview work on the CDN domain; no build-time secret or local URL remains.

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
