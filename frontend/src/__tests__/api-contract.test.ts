import { beforeEach, describe, expect, it, vi } from 'vitest';

const { client } = vi.hoisted(() => ({
  client: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    interceptors: { request: { use: vi.fn() } },
  },
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => client),
    isAxiosError: vi.fn(() => false),
    put: vi.fn(),
  },
}));

vi.mock('../lib/auth', () => ({
  getAccessToken: vi.fn(async () => 'test-access-token'),
  isMockEnabled: vi.fn(() => false),
}));

import { apiConfirm, apiGetCaseAudit, apiRegister, apiSubmitDecision } from '../lib/api';

describe('frontend API contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers customers through the backend so confirmation can create the RDS row', async () => {
    const request = {
      full_name: 'Synthetic Customer',
      date_of_birth: '1990-01-01',
      gender: 'Female',
      phone_number: '+919876543210',
      email: 'synthetic@example.invalid',
      password: 'not-a-real-password',
      address_line1: '1 Synthetic Road',
      city: 'Test City',
      state: 'Test State',
      pincode: '123456',
    };
    client.post.mockResolvedValue({ data: { message: 'ok', cognito_sub: 'synthetic-sub' } });

    await apiRegister(request);

    expect(client.post).toHaveBeenCalledWith('/auth/register', request);
  });

  it('confirms registration through the backend', async () => {
    const request = { email: 'synthetic@example.invalid', confirmation_code: '123456' };
    client.post.mockResolvedValue({ data: { message: 'ok', customer_id: 'synthetic-id' } });

    await apiConfirm(request);

    expect(client.post).toHaveBeenCalledWith('/auth/confirm', request);
  });

  it('keeps the reviewer audit envelope returned by FastAPI', async () => {
    const response = {
      kyc_case_id: 'synthetic-case-id',
      events: [{ actor: 'reviewer', action: 'APPROVED', created_at: '2026-10-30T00:00:00Z' }],
      total: 1,
    };
    client.get.mockResolvedValue({ data: response });

    await expect(apiGetCaseAudit('synthetic-case-id')).resolves.toEqual(response);
    expect(client.get).toHaveBeenCalledWith('/reviewer/cases/synthetic-case-id/audit');
  });

  it('keeps the reviewer decision response contract returned by FastAPI', async () => {
    const request = { decision: 'APPROVED' as const, notes: 'Synthetic acceptance case.' };
    const response = {
      message: 'Decision recorded.',
      decision: 'APPROVED',
      decided_at: '2026-10-31T00:00:00Z',
    };
    client.post.mockResolvedValue({ data: response });

    await expect(apiSubmitDecision('synthetic-case-id', request)).resolves.toEqual(response);
    expect(client.post).toHaveBeenCalledWith(
      '/reviewer/cases/synthetic-case-id/decide',
      request,
    );
  });
});
