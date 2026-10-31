import axios from 'axios';
import { getAccessToken, isMockEnabled } from './auth';
import {
  RegisterRequest,
  RegisterResponse,
  ConfirmRequest,
  CustomerProfile,
  CustomerProfileUpdate,
  KYCStatusResponse,
  UploadUrlRequest,
  UploadUrlResponse,
  KYCSubmitRequest,
  KYCSubmitResponse,
  DashboardSummary,
  ReviewQueueResponse,
  CaseDetail,
  DecisionRequest,
  DecisionResponse,
  AuditEvent,
  AuditResponse,
} from '@/types';
import {
  mockCustomerProfile,
  mockKYCStatus,
  mockDashboardSummary,
  mockReviewQueue,
  mockCaseDetailMap,
} from '@/mocks/mockData';

const configuredBaseURL = import.meta.env.VITE_API_BASE_URL?.trim();
const baseURL = configuredBaseURL || (import.meta.env.DEV ? 'http://localhost:8000' : '');

const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to attach Bearer token on protected calls
apiClient.interceptors.request.use(async (config) => {
  const isPublicAuth =
    config.url?.includes('/auth/register') ||
    config.url?.includes('/auth/confirm');

  if (!baseURL && !isMockEnabled()) {
    throw new Error('API URL is not configured. Set VITE_API_BASE_URL before building the frontend.');
  }

  if (!isPublicAuth) {
    const token = await getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// User-friendly error message extractor
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data && typeof data === 'object') {
      if ('detail' in data && typeof data.detail === 'string') return data.detail;
      if ('message' in data && typeof data.message === 'string') return data.message;
    }
    if (error.response?.status === 401) return 'Session expired or unauthenticated. Please log in.';
    if (error.response?.status === 403) return 'You do not have permission to perform this action.';
    if (error.response?.status === 404) return 'Requested record was not found.';
    if (error.response?.status === 422) return 'Validation error on submitted data.';
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred. Please try again.';
}

// ==================== AUTH API ====================
export const apiRegister = async (data: RegisterRequest): Promise<RegisterResponse> => {
  if (isMockEnabled()) {
    return {
      message: 'Registration successful. Please verify your email with the verification code.',
      cognito_sub: 'mock-cust-' + Math.random().toString(36).substring(7),
    };
  }
  const res = await apiClient.post<RegisterResponse>('/auth/register', data);
  return res.data;
};

export const apiConfirm = async (data: ConfirmRequest): Promise<{ message: string }> => {
  if (isMockEnabled()) {
    return { message: 'Account confirmed successfully. Please log in.' };
  }
  const res = await apiClient.post<{ message: string }>('/auth/confirm', data);
  return res.data;
};

// ==================== CUSTOMER API ====================
export const apiGetProfile = async (): Promise<CustomerProfile> => {
  if (isMockEnabled()) {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pramana_mock_profile');
      if (saved) return JSON.parse(saved);
    }
    return mockCustomerProfile;
  }
  const res = await apiClient.get<CustomerProfile>('/customer/profile');
  return res.data;
};

export const apiUpdateProfile = async (data: CustomerProfileUpdate): Promise<CustomerProfile> => {
  if (isMockEnabled()) {
    const updated = { ...mockCustomerProfile, ...data };
    if (typeof window !== 'undefined') {
      localStorage.setItem('pramana_mock_profile', JSON.stringify(updated));
    }
    return updated;
  }
  const res = await apiClient.put<CustomerProfile>('/customer/profile', data);
  return res.data;
};

export const apiGetKYCStatus = async (): Promise<KYCStatusResponse> => {
  if (isMockEnabled()) {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pramana_mock_kyc_status');
      if (saved) return JSON.parse(saved);
    }
    return mockKYCStatus;
  }
  const res = await apiClient.get<KYCStatusResponse>('/customer/kyc/status');
  return res.data;
};

// ==================== KYC UPLOAD API ====================
export const apiGetUploadUrl = async (data: UploadUrlRequest): Promise<UploadUrlResponse> => {
  if (isMockEnabled()) {
    return {
      upload_url: 'https://httpbin.org/put', // safe mock direct PUT endpoint
      s3_key: `documents/mock-customer/case-1/attempt-1/${data.file_name}`,
      expires_in: 300,
    };
  }
  const res = await apiClient.post<UploadUrlResponse>('/kyc/upload-url', data);
  return res.data;
};

export const directUploadToS3 = async (
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<void> => {
  if (isMockEnabled() && uploadUrl.includes('httpbin.org')) {
    if (onProgress) {
      onProgress(35);
      await new Promise((r) => setTimeout(r, 180));
      onProgress(75);
      await new Promise((r) => setTimeout(r, 180));
      onProgress(100);
    }
    return;
  }

  await axios.put(uploadUrl, file, {
    headers: {
      'Content-Type': file.type,
    },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onProgress) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percent);
      }
    },
  });
};

export const apiSubmitKYC = async (data: KYCSubmitRequest): Promise<KYCSubmitResponse> => {
  if (isMockEnabled()) {
    const updatedStatus: KYCStatusResponse = {
      kyc_case_id: 'case-9821-432a-bc12',
      status: 'PROCESSING',
      latest_attempt: {
        attempt_number: 1,
        document_type: data.document_type,
        status: 'PROCESSING',
        submitted_at: new Date().toISOString(),
      },
      rejection_reason: null,
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('pramana_mock_kyc_status', JSON.stringify(updatedStatus));
    }
    return {
      attempt_id: 'attempt-uuid-' + Date.now(),
      attempt_number: 1,
      status: 'PROCESSING',
      message: 'Document submitted successfully. Verification is in progress.',
    };
  }

  const res = await apiClient.post<KYCSubmitResponse>('/kyc/submit', data);
  return res.data;
};

// ==================== REVIEWER API ====================
export const apiGetReviewerDashboard = async (): Promise<DashboardSummary> => {
  if (isMockEnabled()) {
    return mockDashboardSummary;
  }
  const res = await apiClient.get<DashboardSummary>('/reviewer/dashboard');
  return res.data;
};

export const apiGetReviewQueue = async (page: number = 1, pageSize: number = 20): Promise<ReviewQueueResponse> => {
  if (isMockEnabled()) {
    return mockReviewQueue;
  }
  const res = await apiClient.get<ReviewQueueResponse>('/reviewer/queue', {
    params: { page, page_size: pageSize },
  });
  return res.data;
};

export const apiGetCaseDetail = async (caseId: string): Promise<CaseDetail> => {
  if (isMockEnabled()) {
    const found = mockCaseDetailMap[caseId] || mockCaseDetailMap['case-9821-432a-bc12'];
    return { ...found, kyc_case_id: caseId };
  }
  const res = await apiClient.get<CaseDetail>(`/reviewer/cases/${caseId}`);
  return res.data;
};

export const apiSubmitDecision = async (caseId: string, data: DecisionRequest): Promise<DecisionResponse> => {
  if (isMockEnabled()) {
    return {
      message: `Decision ${data.decision} recorded successfully.`,
      decision: data.decision,
      decided_at: new Date().toISOString(),
    };
  }
  const res = await apiClient.post<DecisionResponse>(`/reviewer/cases/${caseId}/decide`, data);
  return res.data;
};

export const apiGetCaseAudit = async (caseId: string): Promise<AuditResponse> => {
  if (isMockEnabled()) {
    const detail = mockCaseDetailMap[caseId] || mockCaseDetailMap['case-9821-432a-bc12'];
    const events = detail.audit_trail || [];
    return { kyc_case_id: caseId, events, total: events.length };
  }
  const res = await apiClient.get<AuditResponse>(`/reviewer/cases/${caseId}/audit`);
  return res.data;
};

export default apiClient;
