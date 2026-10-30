# Pramāṇa KYC frontend

The active frontend is a **React 18 + TypeScript + Vite** single-page application. It has customer and reviewer portals, Cognito sign-in through Amplify, backend registration/confirmation, direct S3 uploads, KYC status/history, reviewer decisions, and audit views.

## Configuration

Copy `.env.example` to `.env.local` for local development. The supported public build variables are:

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | FastAPI base URL, including its stage path (for example, `https://…execute-api.us-east-1.amazonaws.com/dev`) |
| `VITE_COGNITO_CUSTOMER_USER_POOL_ID` / `VITE_COGNITO_CUSTOMER_CLIENT_ID` | Customer Cognito pool and public app client |
| `VITE_COGNITO_REVIEWER_USER_POOL_ID` / `VITE_COGNITO_REVIEWER_CLIENT_ID` | Reviewer Cognito pool and public app client |
| `VITE_USE_MOCKS` | `true` for the local mock experience; `false` for real Cognito/API/S3 integration |

The AWS region is inferred from the Cognito user-pool IDs. Only public configuration belongs in `VITE_*` variables: Vite embeds them in browser assets. Never put database credentials, AWS access keys, secret ARNs, or Cognito client secrets in frontend configuration.

## Run locally

```bash
cd frontend
npm ci
cp .env.example .env.local
# Keep VITE_API_BASE_URL=http://localhost:8000 for the local backend.
npm run dev
```

Vite serves the app at `http://localhost:3000`. The API must allow this origin through its CORS configuration. For an offline UI walkthrough, set `VITE_USE_MOCKS=true`; for AWS integration, use `false` and a reachable API URL.

## Check and build

```bash
npm test
npm run build
```

The production static site is written to `frontend/dist/`. Build with `VITE_USE_MOCKS=false` and the deployment API/Cognito values. Review the generated bundle before publishing; all `VITE_*` values are public.

The AWS deployment is live at [https://d231rykprgnarh.cloudfront.net](https://d231rykprgnarh.cloudfront.net). CloudFront distribution `EMNA2N11641KK` serves the private S3 frontend bucket through Origin Access Control and maps S3 403/404 responses to `/index.html` so React Router routes work on direct navigation and refresh. The document bucket allows this HTTPS origin for uploads. The backend API now allows this CloudFront origin and `http://localhost:3000`; live preflight checks for customer profile and KYC status pass.

## Integration contracts

- Customer registration and email confirmation call backend `POST /auth/register` and `POST /auth/confirm`; the backend writes the Cognito attributes and creates the customer database record after confirmation.
- Customer and reviewer sign-in/session refresh/sign-out use Amplify with separate Cognito pools. Reviewer self-registration is disabled; reviewers must be provisioned by an administrator.
- Protected API calls send the Cognito access token. FastAPI validates the issuer, signature, expiry, token use, app client, and customer/reviewer role.
- Uploads request a presigned URL from `POST /kyc/upload-url`, PUT the file directly to S3 with its MIME type, then call `POST /kyc/submit` to enqueue processing.
- Supported documents are JPEG, PNG, or PDF up to 10 MiB; PDF processing is limited to three pages. Backend S3 metadata checks are authoritative.
- Reviewer details use `/reviewer/cases/detail?caseId=…` so the static site does not depend on generated dynamic files.

See [`../implementation/PERSON_C_IMPLEMENTATION_PLAN.md`](../implementation/PERSON_C_IMPLEMENTATION_PLAN.md) and [`../implementation/INTEGRATION_DECISIONS_2026-10-29.md`](../implementation/INTEGRATION_DECISIONS_2026-10-29.md) for current test evidence, status mapping, and release gates.
