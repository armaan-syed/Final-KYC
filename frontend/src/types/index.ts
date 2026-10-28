// Pramāṇa KYC - Canonical TypeScript Definitions matching FastAPI Schemas exactly

export type CaseKYCStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'AUTO_VERIFIED'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REUPLOAD_PENDING';

export type AttemptKYCStatus =
  | 'PROCESSING'
  | 'AUTO_VERIFIED'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REUPLOAD_REQUESTED';

// Shared badge accepts the union; API response contracts use the specific type.
export type KYCStatus = CaseKYCStatus | AttemptKYCStatus;

export type DocumentType = 'AADHAAR' | 'PAN';

export type DecisionType = 'APPROVED' | 'REJECTED' | 'REUPLOAD_REQUESTED';

export interface CustomerProfile {
  id: string;
  cognito_sub?: string;
  full_name: string;
  date_of_birth: string;
  gender: string;
  phone_number: string;
  email: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  created_at?: string;
  updated_at?: string;
}

export interface CustomerProfileUpdate {
  full_name?: string;
  phone_number?: string;
  address_line1?: string;
  address_line2?: string | null;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface FieldComparison {
  field: string;
  customer_value?: string;
  document_value?: string;
  is_match: boolean;
}

export interface KYCAttempt {
  attempt_number: number;
  document_type: DocumentType;
  status: AttemptKYCStatus;
  submitted_at: string;
  completed_at?: string | null;
  field_comparisons?: FieldComparison[];
  document_url?: string | null;
  extracted_fields?: Record<string, string>;
}

export interface KYCStatusResponse {
  kyc_case_id: string;
  status: CaseKYCStatus;
  latest_attempt?: KYCAttempt | null;
  rejection_reason?: string | null;
}

export interface UploadUrlRequest {
  document_type: DocumentType;
  file_name: string;
  content_type: string;
}

export interface UploadUrlResponse {
  upload_url: string;
  s3_key: string;
  expires_in: number;
}

export interface KYCSubmitRequest {
  s3_key: string;
  document_type: DocumentType;
  file_name: string;
  file_size_bytes?: number;
}

export interface KYCSubmitResponse {
  attempt_id: string;
  attempt_number: number;
  status: AttemptKYCStatus;
  message: string;
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

export interface ReviewQueueResponse {
  cases: ReviewQueueItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface AuditEvent {
  actor: string;
  action: string;
  details?: Record<string, unknown> | null;
  created_at: string;
}

export interface CaseDetail {
  kyc_case_id: string;
  status: CaseKYCStatus;
  customer: {
    full_name: string;
    date_of_birth: string;
    gender: string;
    address: string;
    email?: string;
    phone_number?: string;
  };
  latest_attempt: {
    attempt_number: number;
    document_type: DocumentType;
    document_url?: string | null;
    extracted_fields?: Record<string, string>;
    field_comparisons?: FieldComparison[];
  };
  attempt_history: Array<{
    attempt_number: number;
    document_type?: DocumentType;
    status: AttemptKYCStatus;
    submitted_at: string;
    completed_at?: string | null;
    rejection_reason?: string | null;
  }>;
  audit_trail: AuditEvent[];
}

export interface DecisionRequest {
  decision: DecisionType;
  notes?: string;
}

export interface DecisionResponse {
  message: string;
  kyc_case_id: string;
  status: CaseKYCStatus;
}

export interface RegisterRequest {
  full_name: string;
  date_of_birth: string;
  gender: string;
  phone_number: string;
  email: string;
  password: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  pincode: string;
}

export interface RegisterResponse {
  message: string;
  cognito_sub: string;
}

export interface ConfirmRequest {
  email: string;
  confirmation_code: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  id_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: {
    sub: string;
    email: string;
    name?: string;
    role?: 'customer' | 'reviewer';
  };
}
