import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  confirmSignIn: vi.fn(),
  signOut: vi.fn(),
  fetchAuthSession: vi.fn(),
}));

vi.mock('aws-amplify', () => ({
  Amplify: { configure: vi.fn() },
}));

vi.mock('aws-amplify/auth', () => authMocks);

import { completeNewPasswordSignIn, loginUser } from '../lib/auth';

describe('Cognito reviewer sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a first-login password challenge without pretending a session exists', async () => {
    authMocks.signIn.mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' },
    });

    await expect(
      loginUser({ email: 'reviewer@example.invalid', password: 'temporary-password' }, 'reviewer'),
    ).resolves.toEqual({ challenge: 'NEW_PASSWORD_REQUIRED' });
    expect(authMocks.fetchAuthSession).not.toHaveBeenCalled();
  });

  it('completes the new-password challenge before returning reviewer tokens', async () => {
    authMocks.confirmSignIn.mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: 'DONE' } });
    authMocks.fetchAuthSession.mockResolvedValue({
      userSub: 'reviewer-sub',
      tokens: {
        accessToken: { toString: () => 'reviewer-access-token' },
        idToken: { toString: () => 'reviewer-id-token' },
      },
    });

    await expect(
      completeNewPasswordSignIn(
        { email: 'reviewer@example.invalid', password: 'StrongPass9!' },
        'reviewer',
      ),
    ).resolves.toMatchObject({
      access_token: 'reviewer-access-token',
      id_token: 'reviewer-id-token',
      user: { sub: 'reviewer-sub', email: 'reviewer@example.invalid', role: 'reviewer' },
    });
    expect(authMocks.confirmSignIn).toHaveBeenCalledWith({ challengeResponse: 'StrongPass9!' });
  });

  it('does not return a logged-in session when Cognito has not completed sign-in', async () => {
    authMocks.signIn.mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_SMS_CODE' },
    });

    await expect(
      loginUser({ email: 'reviewer@example.invalid', password: 'StrongPass9!' }, 'reviewer'),
    ).rejects.toThrow('Additional authentication is required');
    expect(authMocks.fetchAuthSession).not.toHaveBeenCalled();
  });
});
