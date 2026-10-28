import { Amplify } from 'aws-amplify';
import {
  signIn as amplifySignIn,
  signUp as amplifySignUp,
  confirmSignUp as amplifyConfirmSignUp,
  signOut as amplifySignOut,
  fetchAuthSession,
  getCurrentUser as amplifyGetCurrentUser,
} from 'aws-amplify/auth';
import { RegisterRequest, LoginRequest, LoginResponse } from '@/types';

// Detect whether to use client-side mock adapter
export const isMockEnabled = (): boolean => {
  if (typeof window !== 'undefined') {
    const localOverride = localStorage.getItem('pramana_use_mocks');
    if (localOverride !== null) return localOverride === 'true';
  }
  return process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
};

export const configureAmplify = (role: 'customer' | 'reviewer' = 'customer') => {
  const userPoolId =
    role === 'reviewer'
      ? process.env.NEXT_PUBLIC_COGNITO_REVIEWER_USER_POOL_ID
      : process.env.NEXT_PUBLIC_COGNITO_CUSTOMER_USER_POOL_ID;

  const clientId =
    role === 'reviewer'
      ? process.env.NEXT_PUBLIC_COGNITO_REVIEWER_CLIENT_ID
      : process.env.NEXT_PUBLIC_COGNITO_CUSTOMER_CLIENT_ID;

  const region = process.env.NEXT_PUBLIC_AWS_REGION || 'ap-south-1';

  if (userPoolId && clientId) {
    try {
      Amplify.configure({
        Auth: {
          Cognito: {
            userPoolId,
            userPoolClientId: clientId,
            signUpVerificationMethod: 'code',
          },
        },
      });
    } catch {
      // Amplify configure might throw if already configured or during SSR
    }
  }
};

export async function getAccessToken(): Promise<string> {
  if (isMockEnabled()) {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pramana_access_token') || 'mock-jwt-token-active-session';
    }
    return 'mock-jwt-token-active-session';
  }

  try {
    const session = await fetchAuthSession();
    return session.tokens?.accessToken?.toString() ?? '';
  } catch {
    return '';
  }
}

export async function getCurrentUserRole(): Promise<'customer' | 'reviewer' | null> {
  if (typeof window !== 'undefined') {
    const storedRole = localStorage.getItem('pramana_user_role') as 'customer' | 'reviewer' | null;
    if (storedRole) return storedRole;
  }
  return null;
}

export async function registerCustomer(data: RegisterRequest) {
  if (isMockEnabled()) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pramana_pending_reg_email', data.email);
    }
    return {
      message: 'Registration successful. Please verify your email with the verification code.',
      customer_id: 'mock-cust-uuid-' + Date.now(),
    };
  }

  // Real Amplify sign-up against Customer User Pool
  configureAmplify('customer');
  const signUpResult = await amplifySignUp({
    username: data.email,
    password: data.password,
    options: {
      userAttributes: {
        email: data.email,
        phone_number: data.phone_number,
        name: data.full_name,
      },
    },
  });

  return {
    message: 'Registration initiated. Verification code sent.',
    customer_id: signUpResult.userId || '',
  };
}

export async function confirmCustomerEmail(email: string, code: string) {
  if (isMockEnabled()) {
    return { message: 'Email confirmed successfully.' };
  }

  configureAmplify('customer');
  return await amplifyConfirmSignUp({
    username: email,
    confirmationCode: code,
  });
}

export async function loginUser(req: LoginRequest, role: 'customer' | 'reviewer' = 'customer'): Promise<LoginResponse> {
  if (isMockEnabled()) {
    const mockRes: LoginResponse = {
      access_token: `mock-jwt-${role}-token-${Date.now()}`,
      id_token: `mock-id-${role}-token-${Date.now()}`,
      refresh_token: 'mock-refresh-token',
      token_type: 'Bearer',
      expires_in: 3600,
      user: {
        sub: `sub-${role}-001`,
        email: req.email,
        name: role === 'customer' ? 'ARMAAN SYED' : 'SENIOR REVIEWER',
        role,
      },
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem('pramana_access_token', mockRes.access_token);
      localStorage.setItem('pramana_user_role', role);
      localStorage.setItem('pramana_user_email', req.email);
      localStorage.setItem('pramana_user_name', mockRes.user.name || '');
    }
    return mockRes;
  }

  configureAmplify(role);
  const signInOutput = await amplifySignIn({
    username: req.email,
    password: req.password,
  });

  const session = await fetchAuthSession();
  const token = session.tokens?.accessToken?.toString() || '';
  const idToken = session.tokens?.idToken?.toString() || '';

  const res: LoginResponse = {
    access_token: token,
    id_token: idToken,
    refresh_token: '',
    token_type: 'Bearer',
    expires_in: 3600,
    user: {
      sub: session.userSub || '',
      email: req.email,
      role,
    },
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem('pramana_access_token', token);
    localStorage.setItem('pramana_user_role', role);
    localStorage.setItem('pramana_user_email', req.email);
  }

  return res;
}

export async function logoutUser() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('pramana_access_token');
    localStorage.removeItem('pramana_user_role');
    localStorage.removeItem('pramana_user_email');
    localStorage.removeItem('pramana_user_name');
  }

  if (!isMockEnabled()) {
    try {
      await amplifySignOut();
    } catch {
      // Ignore signOut if already unauthenticated
    }
  }
}
