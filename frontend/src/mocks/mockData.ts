import {
  CustomerProfile,
  KYCStatusResponse,
  DashboardSummary,
  ReviewQueueResponse,
  CaseDetail,
  AuditEvent,
} from '@/types';

export const mockCustomerProfile: CustomerProfile = {
  id: 'c7b5f12a-89a1-432d-9372-e16281729011',
  cognito_sub: 'sub-customer-armaan-1234',
  full_name: 'ARMAAN SYED',
  date_of_birth: '2007-02-15',
  gender: 'Male',
  phone_number: '+919876543210',
  email: 'armaan@example.com',
  address_line1: '123 Marine Lines',
  address_line2: 'Flat 4B, Ocean View',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400020',
  created_at: '2026-10-25T09:00:00Z',
};

export const mockKYCStatus: KYCStatusResponse = {
  kyc_case_id: 'case-9821-432a-bc12',
  status: 'REVIEW_REQUIRED',
  latest_attempt: {
    attempt_number: 1,
    document_type: 'AADHAAR',
    status: 'REVIEW_REQUIRED',
    submitted_at: '2026-10-28T10:30:00Z',
    document_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
    extracted_fields: {
      name: 'ARMAAN SYED',
      date_of_birth: '15/02/2006',
      gender: 'Male',
      aadhaar_number: 'XXXX-XXXX-4921',
    },
    field_comparisons: [
      {
        field: 'name',
        customer_value: 'ARMAAN SYED',
        document_value: 'ARMAAN SYED',
        is_match: true,
      },
      {
        field: 'date_of_birth',
        customer_value: '15/02/2007',
        document_value: '15/02/2006',
        is_match: false,
      },
      {
        field: 'gender',
        customer_value: 'Male',
        document_value: 'Male',
        is_match: true,
      },
    ],
  },
  rejection_reason: null,
};

export const mockDashboardSummary: DashboardSummary = {
  pending_review: 7,
  auto_verified_today: 18,
  approved_today: 9,
  rejected_today: 2,
  total_cases: 74,
};

export const mockReviewQueue: ReviewQueueResponse = {
  cases: [
    {
      kyc_case_id: 'case-9821-432a-bc12',
      customer_name: 'ARMAAN SYED',
      document_type: 'AADHAAR',
      submitted_at: '2026-10-28T10:30:00Z',
      mismatched_fields: ['date_of_birth'],
      attempt_number: 1,
    },
    {
      kyc_case_id: 'case-8123-bc99-2311',
      customer_name: 'PRIYA SHARMA',
      document_type: 'PAN',
      submitted_at: '2026-10-28T11:15:00Z',
      mismatched_fields: ['date_of_birth'],
      attempt_number: 2,
    },
    {
      kyc_case_id: 'case-7731-ff12-4402',
      customer_name: 'RAHUL MEHTA',
      document_type: 'AADHAAR',
      submitted_at: '2026-10-28T11:45:00Z',
      mismatched_fields: ['name'],
      attempt_number: 1,
    },
    {
      kyc_case_id: 'case-5510-cc88-9923',
      customer_name: 'SNEHA PATEL',
      document_type: 'PAN',
      submitted_at: '2026-10-28T12:05:00Z',
      mismatched_fields: ['gender'],
      attempt_number: 1,
    },
    {
      kyc_case_id: 'case-4401-ee21-7788',
      customer_name: 'VIKRAM MALHOTRA',
      document_type: 'AADHAAR',
      submitted_at: '2026-10-28T12:30:00Z',
      mismatched_fields: ['date_of_birth', 'name'],
      attempt_number: 3,
    },
  ],
  total: 5,
  page: 1,
  page_size: 10,
};

export const mockCaseDetailMap: Record<string, CaseDetail> = {
  'case-9821-432a-bc12': {
    kyc_case_id: 'case-9821-432a-bc12',
    status: 'REVIEW_REQUIRED',
    customer: {
      full_name: 'ARMAAN SYED',
      date_of_birth: '2007-02-15',
      gender: 'Male',
      email: 'armaan@example.com',
      phone_number: '+919876543210',
      address: '123 Marine Lines, Flat 4B, Ocean View, Mumbai, Maharashtra 400020',
    },
    latest_attempt: {
      attempt_number: 1,
      document_type: 'AADHAAR',
      status: 'REVIEW_REQUIRED',
      document_url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
      extracted_fields: {
        name: 'ARMAAN SYED',
        date_of_birth: '15/02/2006',
        gender: 'Male',
        aadhaar_number: 'XXXX-XXXX-4921',
      },
      field_comparisons: [
        {
          field: 'name',
          customer_value: 'ARMAAN SYED',
          document_value: 'ARMAAN SYED',
          is_match: true,
        },
        {
          field: 'date_of_birth',
          customer_value: '15/02/2007',
          document_value: '15/02/2006',
          is_match: false,
        },
        {
          field: 'gender',
          customer_value: 'Male',
          document_value: 'Male',
          is_match: true,
        },
      ],
    },
    attempt_history: [
      {
        attempt_number: 1,
        document_type: 'AADHAAR',
        status: 'REVIEW_REQUIRED',
        submitted_at: '2026-10-28T10:30:00Z',
      },
    ],
    audit_trail: [
      {
        actor: 'SYSTEM',
        action: 'SUBMITTED',
        details: { document_type: 'AADHAAR', file_name: 'aadhaar_scan.pdf' },
        created_at: '2026-10-28T10:30:02Z',
      },
      {
        actor: 'SYSTEM',
        action: 'PROCESSING_STARTED',
        details: { queue_msg_id: 'sqs-msg-4928' },
        created_at: '2026-10-28T10:30:15Z',
      },
      {
        actor: 'SYSTEM',
        action: 'REVIEW_REQUIRED',
        details: { mismatched_fields: ['date_of_birth'] },
        created_at: '2026-10-28T10:31:05Z',
      },
    ],
  },
};
