import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Amplify } from 'aws-amplify';

const authMocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  confirmSignIn: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  confirmResetPassword: vi.fn(),
  fetchAuthSession: vi.fn(),
}));

vi.mock('aws-amplify', () => ({
  Amplify: { configure: vi.fn() },
}));

vi.mock('aws-amplify/auth', () => authMocks);

import {
  completeNewPasswordSignIn,
  confirmPasswordReset,
  loginUser,
  requestPasswordReset,
} from '../lib/auth';

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

  it('requests a reset code from the selected reviewer user pool', async () => {
    authMocks.resetPassword.mockResolvedValue({
      isPasswordReset: false,
      nextStep: { resetPasswordStep: 'CONFIRM_RESET_PASSWORD_WITH_CODE' },
    });

    await requestPasswordReset('reviewer@example.invalid', 'reviewer');

    expect(authMocks.resetPassword).toHaveBeenCalledWith({ username: 'reviewer@example.invalid' });
    expect(Amplify.configure).toHaveBeenCalledWith({
      Auth: {
        Cognito: {
          userPoolId: 'us-east-1_IQzz0ktCu',
          userPoolClientId: '5fh52722t9o0le48pieqavtcv0',
          signUpVerificationMethod: 'code',
        },
      },
    });
  });

  it('confirms a password reset through Cognito using the selected customer pool', async () => {
    authMocks.confirmResetPassword.mockResolvedValue(undefined);

    await confirmPasswordReset('customer@example.invalid', '123456', 'StrongPass9!', 'customer');

    expect(authMocks.confirmResetPassword).toHaveBeenCalledWith({
      username: 'customer@example.invalid',
      confirmationCode: '123456',
      newPassword: 'StrongPass9!',
    });
    expect(Amplify.configure).toHaveBeenCalledWith({
      Auth: {
        Cognito: {
          userPoolId: 'us-east-1_8Q9onMEne',
          userPoolClientId: '1rtg8t1nbggjsf2i0d8g7jqqov',
          signUpVerificationMethod: 'code',
        },
      },
    });
  });
});
