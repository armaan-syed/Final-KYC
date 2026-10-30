import { Amplify } from 'aws-amplify';
import {
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  fetchAuthSession,
} from 'aws-amplify/auth';
import { LoginRequest, LoginResponse } from '@/types';

// Hardcoded admin credentials for reviewer/admin login
const HARDCODED_ADMINS: Record<string, { password: string; name: string }> = {
  'attherate1807@gmail.com': { password: 'admin', name: 'Admin – Attherate' },
  'adityasable4510@gmail.com': { password: 'admin', name: 'Admin – Aditya Sable' },
  'armaansyed009@gmail.com': { password: 'admin', name: 'Admin – Armaan Syed' },
};

function tryHardcodedAdmin(email: string, password: string): LoginResponse | null {
  const entry = HARDCODED_ADMINS[email.toLowerCase().trim()];
  if (!entry || entry.password !== password) return null;

  const now = Date.now();
  return {
    access_token: `admin-jwt-${now}`,
    id_token: `admin-id-${now}`,
    refresh_token: `admin-refresh-${now}`,
    token_type: 'Bearer',
    expires_in: 86400,
    user: {
      sub: `admin-${email}`,
      email,
      name: entry.name,
      role: 'reviewer',
    },
  };
}

// Detect whether to use client-side mock adapter
export const isMockEnabled = (): boolean => {
  if (typeof window !== 'undefined') {
    const localOverride = localStorage.getItem('pramana_use_mocks');
    if (localOverride !== null) return localOverride === 'true';
  }
  return import.meta.env.VITE_USE_MOCKS === 'true';
};

export const configureAmplify = (role: 'customer' | 'reviewer' = 'customer') => {
  const userPoolId =
    role === 'reviewer'
      ? import.meta.env.VITE_COGNITO_REVIEWER_USER_POOL_ID || 'us-east-1_IQzz0ktCu'
      : import.meta.env.VITE_COGNITO_CUSTOMER_USER_POOL_ID || 'us-east-1_8Q9onMEne';

  const clientId =
    role === 'reviewer'
      ? import.meta.env.VITE_COGNITO_REVIEWER_CLIENT_ID || '5fh52722t9o0le48pieqavtcv0'
      : import.meta.env.VITE_COGNITO_CUSTOMER_CLIENT_ID || '1rtg8t1nbggjsf2i0d8g7jqqov';

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
      // Ignore if already configured
    }
  }
};

export async function getAccessToken(): Promise<string> {
  // Return stored token for hardcoded admin sessions
  if (typeof window !== 'undefined') {
    const storedToken = localStorage.getItem('pramana_access_token');
    if (storedToken && storedToken.startsWith('admin-jwt-')) {
      return storedToken;
    }
  }

  if (isMockEnabled()) {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pramana_access_token') || 'mock-jwt-token-active-session';
    }
    return 'mock-jwt-token-active-session';
  }

  try {
    const role = await getCurrentUserRole();
    configureAmplify(role || 'customer');
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

export async function loginUser(req: LoginRequest, role: 'customer' | 'reviewer' = 'customer'): Promise<LoginResponse> {
  // ── Hardcoded admin bypass (checked first, before mock or Cognito) ──
  const adminResult = tryHardcodedAdmin(req.email, req.password);
  if (adminResult) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pramana_access_token', adminResult.access_token);
      localStorage.setItem('pramana_user_role', 'reviewer');
      localStorage.setItem('pramana_user_email', adminResult.user.email);
      localStorage.setItem('pramana_user_name', adminResult.user.name || '');
    }
    return adminResult;
  }

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
        name: role === 'customer' ? 'ARMAAN SYED' : 'SENIOR AUDIT REVIEWER',
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
  await amplifySignIn({
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
  const isAdminSession =
    typeof window !== 'undefined' &&
    (localStorage.getItem('pramana_access_token') || '').startsWith('admin-jwt-');

  if (typeof window !== 'undefined') {
    localStorage.removeItem('pramana_access_token');
    localStorage.removeItem('pramana_user_role');
    localStorage.removeItem('pramana_user_email');
    localStorage.removeItem('pramana_user_name');
  }

  if (!isAdminSession && !isMockEnabled()) {
    try {
      await amplifySignOut();
    } catch {
      // Ignore if unauthenticated
    }
  }
}
