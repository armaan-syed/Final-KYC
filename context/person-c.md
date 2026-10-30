# Pramāṇa — Person C Workload
## Original framework proposal · Customer Portal · Reviewer Portal

> This is the original assignment brief. Its Next.js examples describe the
> proposed starting design and are not the active implementation. The checked-in
> `master` frontend is React 18 + TypeScript + Vite; use
> [`../frontend/README.md`](../frontend/README.md) and
> [`../implementation/PERSON_C_IMPLEMENTATION_PLAN.md`](../implementation/PERSON_C_IMPLEMENTATION_PLAN.md)
> for the runnable configuration and current status.

> Person C owns everything the user sees. This includes the customer-facing portal (registration, login, document upload, KYC status) and the reviewer portal (dashboard, case queue, case detail, decision actions). You consume the API defined by Person B and deploy to S3 + CloudFront provisioned by Person A.

---

## Your Responsibilities at a Glance

| Area | What You Own |
|---|---|
| Next.js application | Project setup, routing, layout, pages |
| Customer portal | Registration, login, profile, KYC upload, status page |
| Reviewer portal | Dashboard, review queue, case detail, decision form |
| Cognito auth | AWS Amplify auth integration, token management |
| API integration | All API calls to FastAPI backend (Person B's endpoints) |
| Document upload | Direct-to-S3 presigned URL upload flow |
| UI components | All reusable components — forms, tables, status badges, field comparison display |
| Deployment | Build + deploy to S3 bucket, CloudFront invalidation |

---

## 1. Tech Stack

| Tool | Purpose |
|---|---|
| Next.js 14 (App Router) | Framework — SSR/CSR hybrid, file-based routing |
| React 18 | UI library |
| TypeScript | Type safety across the entire frontend |
| Tailwind CSS | Utility-first styling |
| AWS Amplify (auth only) | Cognito auth — sign in, sign up, token handling |
| Axios or fetch | API calls to FastAPI backend |
| React Query (TanStack Query) | Server state management, caching, loading states |
| React Hook Form | Form handling and validation |
| Zod | Schema validation (paired with React Hook Form) |

---

## 2. Project Structure

```
frontend/
  app/
    (auth)/
      register/
        page.tsx          ← Customer registration form
      login/
        page.tsx          ← Customer login
      confirm/
        page.tsx          ← Cognito email verification code
    (customer)/
      layout.tsx          ← Protected customer layout (requires customer auth)
      dashboard/
        page.tsx          ← Customer home — KYC status overview
      kyc/
        upload/
          page.tsx        ← Document upload page
        status/
          page.tsx        ← KYC status + attempt history
    (reviewer)/
      layout.tsx          ← Protected reviewer layout (requires reviewer auth)
      dashboard/
        page.tsx          ← Reviewer dashboard with counts
      queue/
        page.tsx          ← Pending review queue
      cases/
        page.tsx          ← All cases with filters
        [caseId]/
          page.tsx        ← Full case detail + decision form
    layout.tsx            ← Root layout
    page.tsx              ← Landing page (redirect to login)
  components/
    auth/
      RegisterForm.tsx
      LoginForm.tsx
    customer/
      KYCStatusBadge.tsx
      KYCStatusCard.tsx
      DocumentUploadForm.tsx
      AttemptHistoryList.tsx
    reviewer/
      DashboardSummary.tsx
      ReviewQueueTable.tsx
      CaseDetailCard.tsx
      FieldComparisonTable.tsx
      DecisionForm.tsx
      AuditTrailList.tsx
    shared/
      Navbar.tsx
      LoadingSpinner.tsx
      ErrorAlert.tsx
      SuccessAlert.tsx
      Badge.tsx
  lib/
    api.ts                ← Axios instance + all API call functions
    auth.ts               ← Amplify auth helpers
    types.ts              ← TypeScript types matching API schemas
    utils.ts              ← Date formatting, field label mapping, etc.
  public/
    pramana-logo.svg
  next.config.js
  tailwind.config.js
  tsconfig.json
```

---

## 3. Authentication

### 3.1 Cognito via AWS Amplify
Use AWS Amplify Auth for Cognito integration. This handles token storage, refresh, and the Cognito Hosted UI or custom sign-in flow.

```typescript
// lib/auth.ts
import { Amplify } from 'aws-amplify';
import { signIn, signUp, confirmSignUp, signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_APP_CLIENT_ID!,
      region: process.env.NEXT_PUBLIC_AWS_REGION!,
    }
  }
});

export async function getAccessToken(): Promise<string> {
  const session = await fetchAuthSession();
  return session.tokens?.accessToken?.toString() ?? '';
}
```

### 3.2 Environment Variables (frontend)
```bash
# .env.local (git-ignored)
NEXT_PUBLIC_API_BASE_URL=https://{api-gateway-id}.execute-api.{region}.amazonaws.com
NEXT_PUBLIC_COGNITO_USER_POOL_ID=ap-south-1_XXXXXXXXX
NEXT_PUBLIC_COGNITO_APP_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_AWS_REGION=ap-south-1
```

Get the public Cognito pool/client values from Person B and the API URL from Person B.

### 3.3 Route Protection
Use Next.js middleware to protect routes:

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('amplify-auth-token');

  const isCustomerRoute = request.nextUrl.pathname.startsWith('/dashboard') ||
                          request.nextUrl.pathname.startsWith('/kyc');
  const isReviewerRoute = request.nextUrl.pathname.startsWith('/reviewer');

  if ((isCustomerRoute || isReviewerRoute) && !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}
```

---

## 4. API Client

### 4.1 Axios Instance
```typescript
// lib/api.ts
import axios from 'axios';
import { getAccessToken } from './auth';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
});

// Attach Cognito JWT to every request
api.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
```

### 4.2 API Functions
```typescript
// All typed API calls

// Auth
export const register = (data: RegisterRequest) =>
  api.post<RegisterResponse>('/auth/register', data);

export const login = (data: LoginRequest) =>
  api.post<LoginResponse>('/auth/login', data);

// Customer
export const getProfile = () =>
  api.get<CustomerProfile>('/customer/profile');

export const getKYCStatus = () =>
  api.get<KYCStatusResponse>('/customer/kyc/status');

// KYC Upload
export const getUploadUrl = (data: UploadUrlRequest) =>
  api.post<UploadUrlResponse>('/kyc/upload-url', data);

export const submitKYC = (data: KYCSubmitRequest) =>
  api.post<KYCSubmitResponse>('/kyc/submit', data);

// Reviewer
export const getReviewerDashboard = () =>
  api.get<DashboardSummary>('/reviewer/dashboard');

export const getReviewQueue = (page: number = 1) =>
  api.get<ReviewQueueResponse>('/reviewer/queue', { params: { page } });

export const getCaseDetail = (caseId: string) =>
  api.get<CaseDetail>(`/reviewer/cases/${caseId}`);

export const submitDecision = (caseId: string, data: DecisionRequest) =>
  api.post<DecisionResponse>(`/reviewer/cases/${caseId}/decide`, data);
```

---

## 5. TypeScript Types

```typescript
// lib/types.ts

export type KYCStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'AUTO_VERIFIED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REUPLOAD_PENDING';

export type DocumentType = 'AADHAAR' | 'PAN';

export type Decision = 'APPROVED' | 'REJECTED' | 'REUPLOAD_REQUESTED';

export interface FieldComparison {
  field: string;
  customer_value: string;
  document_value: string;
  is_match: boolean;
}

export interface KYCAttempt {
  attempt_number: number;
  document_type: DocumentType;
  status: KYCStatus;
  submitted_at: string;
  completed_at?: string;
  field_comparisons?: FieldComparison[];
  document_url?: string;
  extracted_fields?: Record<string, string>;
}

export interface KYCCase {
  kyc_case_id: string;
  status: KYCStatus;
  latest_attempt?: KYCAttempt;
  attempt_history?: KYCAttempt[];
  rejection_reason?: string;
}

export interface CustomerProfile {
  id: string;
  full_name: string;
  date_of_birth: string;
  gender: string;
  phone_number: string;
  email: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  pincode: string;
}

export interface DashboardSummary {
  pending_review: number;
  auto_verified_today: number;
  approved_today: number;
  rejected_today: number;
  total_cases: number;
}

export interface ReviewQueueItem {
  kyc_case_id: string;
  customer_name: string;
  document_type: DocumentType;
  submitted_at: string;
  mismatched_fields: string[];
  attempt_number: number;
}

export interface AuditEvent {
  actor: string;
  action: string;
  details?: Record<string, unknown>;
  created_at: string;
}
```

---

## 6. Customer Portal Pages

### 6.1 Registration Page (`/register`)
Form fields:
- Full Name
- Date of Birth (date picker)
- Gender (select: Male / Female / Other)
- Phone Number
- Email
- Password + Confirm Password
- Address Line 1
- Address Line 2 (optional)
- City
- State
- Pincode

On submit:
1. Validate with Zod
2. Call `POST /auth/register`
3. Redirect to `/confirm` with email in query param

### 6.2 Email Confirmation Page (`/confirm`)
- Input for the 6-digit code Cognito emails
- Call `POST /auth/confirm`
- On success → redirect to `/login`

### 6.3 Login Page (`/login`)
- Email + Password
- Call Amplify `signIn()`
- On success → redirect to `/dashboard`

### 6.4 Customer Dashboard (`/dashboard`)
Shows the customer's current KYC status prominently:

```
┌─────────────────────────────────────────┐
│  Welcome, Armaan                        │
│                                         │
│  KYC Status                             │
│  ┌─────────────────────────────────┐   │
│  │  🟡 REVIEW REQUIRED             │   │
│  │  Submitted: 28 Oct 2026         │   │
│  │  Document: Aadhaar Card         │   │
│  └─────────────────────────────────┘   │
│                                         │
│  [View Details]  [Submit New Document]  │
└─────────────────────────────────────────┘
```

Status badge colours:
- PENDING → grey
- PROCESSING → blue (animated)
- AUTO_VERIFIED / APPROVED → green
- REVIEW_REQUIRED → yellow
- REJECTED → red
- REUPLOAD_PENDING → orange

### 6.5 Document Upload Page (`/kyc/upload`)
Only accessible when status is PENDING or REUPLOAD_PENDING.

Steps:
1. Select document type (Aadhaar / PAN) — radio buttons
2. File input (accept: image/jpeg, image/png, application/pdf)
3. Preview thumbnail of selected file
4. Submit button

**Upload flow (important — direct to S3, not via API):**
```typescript
async function handleUpload(file: File, documentType: DocumentType) {
  // Step 1: Get presigned URL from backend
  const { data: { upload_url, s3_key } } = await getUploadUrl({
    document_type: documentType,
    file_name: file.name,
    content_type: file.type
  });

  // Step 2: Upload directly to S3 (NOT through the API)
  await axios.put(upload_url, file, {
    headers: { 'Content-Type': file.type }
  });

  // Step 3: Notify backend that upload is complete
  await submitKYC({
    s3_key,
    document_type: documentType,
    file_name: file.name,
    file_size_bytes: file.size
  });
}
```

Show a progress bar during the S3 upload using axios `onUploadProgress`.

### 6.6 KYC Status Page (`/kyc/status`)
Shows:
- Current status with badge
- If REJECTED: reason (from API, shown in portal — not in SMS)
- Attempt history list (Attempt 1, Attempt 2, etc.)
- For each attempt: document type, submission date, outcome

```
KYC Verification History

Attempt 2  (Current)
  Status: REVIEW REQUIRED
  Document: Aadhaar Card
  Submitted: 28 Oct 2026, 10:30am

Attempt 1
  Status: REUPLOAD REQUESTED
  Document: Aadhaar Card
  Submitted: 27 Oct 2026, 3:15pm
  Reason: Document image was unclear
```

---

## 7. Reviewer Portal Pages

### 7.1 Reviewer Dashboard (`/reviewer/dashboard`)

```
┌────────────────────────────────────────────────────┐
│  Pramāṇa  —  Reviewer Dashboard                    │
│                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │    7     │  │   12     │  │    2     │         │
│  │ Pending  │  │ Verified │  │ Rejected │         │
│  │ Reviews  │  │  Today   │  │  Today   │         │
│  └──────────┘  └──────────┘  └──────────┘         │
│                                                    │
│  [Go to Review Queue →]                            │
└────────────────────────────────────────────────────┘
```

Polling: refresh dashboard counts every 60 seconds using React Query's `refetchInterval`.

### 7.2 Review Queue (`/reviewer/queue`)

Table with columns:
- KYC ID
- Customer Name
- Document Type
- Submitted At
- Mismatched Fields (badges showing which fields failed)
- Action: [Review →]

```
┌────────────────────────────────────────────────────────────────┐
│  🔔 7 Pending Reviews                                          │
│                                                                │
│  KYC ID      Customer         Doc      Submitted    Mismatch  │
│  ──────────────────────────────────────────────────────────── │
│  KYC-1048    Priya Sharma      PAN     28 Oct 10:30  DOB       │
│  KYC-1047    Rahul Mehta      Aadhaar  28 Oct 09:15  Name      │
│  KYC-1046    Sneha Patel      Aadhaar  27 Oct 16:42  DOB       │
└────────────────────────────────────────────────────────────────┘
```

### 7.3 Case Detail Page (`/reviewer/cases/[caseId]`)

Layout:
```
┌──────────────────────────────────────────────────────────┐
│  KYC Case: KYC-1048                    Status: REVIEW    │
├──────────────────────┬───────────────────────────────────┤
│  CUSTOMER INFO       │  DOCUMENT                        │
│                      │                                   │
│  Name: Priya Sharma  │  [Document Image Preview]        │
│  DOB: 15/03/1995     │                                   │
│  Gender: Female      │  Document Type: PAN Card         │
│  Address: ...        │  Attempt: 1 of 1                 │
│                      │  Submitted: 28 Oct 10:30am       │
├──────────────────────┴───────────────────────────────────┤
│  FIELD COMPARISON                                        │
│                                                          │
│  Field         Customer DB      Document       Match     │
│  ──────────────────────────────────────────────────────  │
│  Name          PRIYA SHARMA    PRIYA SHARMA     ✅        │
│  Date of Birth 15/03/1995      15/03/1994       ❌        │
│  Gender        Female          Female           ✅        │
├──────────────────────────────────────────────────────────┤
│  DECISION                                                │
│                                                          │
│  Notes: [________________________________]               │
│                                                          │
│  [✅ Approve]  [❌ Reject]  [🔄 Request Re-upload]       │
└──────────────────────────────────────────────────────────┘
```

**Field Comparison Table component:**
```tsx
// components/reviewer/FieldComparisonTable.tsx
export function FieldComparisonTable({ comparisons }: { comparisons: FieldComparison[] }) {
  const fieldLabels: Record<string, string> = {
    name: 'Full Name',
    date_of_birth: 'Date of Birth',
    gender: 'Gender',
    address: 'Address',
  };

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-gray-100">
          <th>Field</th>
          <th>Customer Database</th>
          <th>Document</th>
          <th>Match</th>
        </tr>
      </thead>
      <tbody>
        {comparisons.map((c) => (
          <tr key={c.field} className={c.is_match ? '' : 'bg-red-50'}>
            <td>{fieldLabels[c.field] ?? c.field}</td>
            <td>{c.customer_value}</td>
            <td>{c.document_value}</td>
            <td className="text-center">
              {c.is_match ? '✅' : '❌'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### 7.4 Decision Form
```tsx
// components/reviewer/DecisionForm.tsx
export function DecisionForm({ caseId, onDecisionSubmitted }: Props) {
  const [notes, setNotes] = useState('');
  const { mutate: submitDecision, isLoading } = useMutation(
    (decision: Decision) => submitDecision(caseId, { decision, notes }),
    { onSuccess: onDecisionSubmitted }
  );

  return (
    <div className="border-t pt-4 mt-4">
      <h3 className="font-semibold mb-2">Decision</h3>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional notes..."
        className="w-full border rounded p-2 mb-4"
        rows={3}
      />
      <div className="flex gap-3">
        <button
          onClick={() => submitDecision('APPROVED')}
          className="bg-green-600 text-white px-4 py-2 rounded"
          disabled={isLoading}
        >
          ✅ Approve
        </button>
        <button
          onClick={() => submitDecision('REJECTED')}
          className="bg-red-600 text-white px-4 py-2 rounded"
          disabled={isLoading}
        >
          ❌ Reject
        </button>
        <button
          onClick={() => submitDecision('REUPLOAD_REQUESTED')}
          className="bg-orange-500 text-white px-4 py-2 rounded"
          disabled={isLoading}
        >
          🔄 Request Re-upload
        </button>
      </div>
    </div>
  );
}
```

### 7.5 Audit Trail
Display at the bottom of the case detail page:

```
AUDIT TRAIL
──────────────────────────────────────────────
28 Oct 2026, 10:30am   SYSTEM      Document submitted
28 Oct 2026, 10:31am   SYSTEM      Processing started
28 Oct 2026, 10:32am   SYSTEM      Review required — DOB mismatch
28 Oct 2026, 10:42am   reviewer_17 Decision: REJECTED
                                   Reason: Date of birth mismatch
```

---

## 8. Shared Components

### 8.1 KYC Status Badge
```tsx
const statusConfig = {
  PENDING:          { label: 'Pending',          color: 'bg-gray-200 text-gray-700' },
  PROCESSING:       { label: 'Processing',        color: 'bg-blue-100 text-blue-700 animate-pulse' },
  AUTO_VERIFIED:    { label: 'Verified',          color: 'bg-green-100 text-green-700' },
  APPROVED:         { label: 'Approved',          color: 'bg-green-100 text-green-700' },
  REJECTED:         { label: 'Rejected',          color: 'bg-red-100 text-red-700' },
  REUPLOAD_PENDING: { label: 'Re-upload Required', color: 'bg-orange-100 text-orange-700' },
  REVIEW_REQUIRED:  { label: 'Under Review',      color: 'bg-yellow-100 text-yellow-700' },
};

export function KYCStatusBadge({ status }: { status: KYCStatus }) {
  const config = statusConfig[status];
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}
```

---

## 9. Deployment

### 9.1 Build
```bash
npm run build
# Output: .next/ (for SSR) or out/ (for static export)
```

For deployment to S3 + CloudFront, use **static export** (`next export`) — no server required.

Add to `next.config.js`:
```js
const nextConfig = {
  output: 'export',
  trailingSlash: true,
};
```

### 9.2 Deploy to S3
```bash
# Build
npm run build

# Sync to S3 (bucket name from Person A)
aws s3 sync out/ s3://pramana-frontend-{account-id} --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id {distribution-id} \
  --paths "/*"
```

### 9.3 Environment Variables for Build
Set these as GitHub Actions secrets or manually before building:
```bash
NEXT_PUBLIC_API_BASE_URL
NEXT_PUBLIC_COGNITO_USER_POOL_ID
NEXT_PUBLIC_COGNITO_APP_CLIENT_ID
NEXT_PUBLIC_AWS_REGION
```

---

## 10. Interfaces with Person A and Person B

### 10.1 From Person A — Values You Need
- CloudFront domain (your frontend URL)
- S3 frontend bucket name (for deployment)
- CloudFront distribution ID (for cache invalidation)
- Cognito User Pool ID + App Client ID

### 10.2 From Person B — Values You Need
- API Gateway base URL
- All API endpoint paths, request/response schemas (person-b.md is your reference)
- Error response format (so you can display correct error messages)

### 10.3 Critical Shared Contract: Upload Flow
The document upload flow is a three-way interaction you must coordinate:
1. You call `POST /kyc/upload-url` → get presigned S3 URL from Person B
2. You upload directly to S3 using that presigned URL (not via API)
3. You call `POST /kyc/submit` → Person B enqueues to SQS
4. Person A's OCR Worker processes the document
5. Status updates appear on your status page (poll `/customer/kyc/status` every 10 seconds while PROCESSING)

### 10.4 Polling Strategy for PROCESSING Status
While the customer's KYC is in PROCESSING state, poll the status endpoint:
```typescript
const { data } = useQuery('kycStatus', getKYCStatus, {
  refetchInterval: status === 'PROCESSING' ? 10000 : false,  // Poll every 10s while processing
});
```

---

## 11. Build Order for Person C

1. Set up Next.js 14 project with TypeScript + Tailwind CSS
2. Configure AWS Amplify auth (`lib/auth.ts`) with Person B's Cognito values
3. Set up Axios API client (`lib/api.ts`) with Person B's API URL
4. Define all TypeScript types (`lib/types.ts`)
5. Build registration + login + confirm pages
6. Build customer dashboard page (KYC status display)
7. Build document upload page (presigned URL flow)
8. Build KYC status page (attempt history)
9. Build reviewer dashboard page
10. Build reviewer queue page
11. Build case detail page (field comparison table + decision form)
12. Build audit trail display
13. Add route protection (middleware)
14. Test full upload flow end-to-end with Person A and Person B
15. Build + deploy to S3, confirm CloudFront serves the app
16. Test reviewer flow end-to-end

---

## 12. Design Notes

- Keep the UI clean and professional — this is a banking-style system
- Mobile responsiveness is important — customers may upload on phone
- The file upload step must feel smooth — show progress, handle errors gracefully
- Reviewer portal should feel like an internal tool — dense information, not decorative
- All loading states must be handled — no blank screens
- Error messages must be human-readable — not raw API errors
