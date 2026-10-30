import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  ShieldCheck,
  ArrowRight,
  Lock,
  Building2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  User,
  Shield,
} from 'lucide-react';
import { completeNewPasswordSignIn, loginUser } from '@/lib/auth';
import { ErrorAlert } from '@/components/ui/Alerts';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid official email address'),
  password: z.string().min(1, 'Please enter your password'),
  confirmPassword: z.string().optional(),
  role: z.enum(['customer', 'reviewer']),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [newPasswordRequired, setNewPasswordRequired] = useState(false);
  const [challengeEmail, setChallengeEmail] = useState('');
  const [challengeRole, setChallengeRole] = useState<'customer' | 'reviewer'>('customer');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      role: 'customer',
    },
  });

  const selectedRole = watch('role');

  const onSubmit = async (data: LoginFormData) => {
    setErrorMessage(null);
    setLoading(true);
    try {
      let role = data.role;
      if (newPasswordRequired) {
        const hasRequiredComplexity =
          data.password.length >= 8 &&
          /[A-Z]/.test(data.password) &&
          /[a-z]/.test(data.password) &&
          /\d/.test(data.password) &&
          /[^A-Za-z0-9]/.test(data.password);
        if (!hasRequiredComplexity) {
          setErrorMessage('Use at least 8 characters with uppercase, lowercase, a number, and a symbol.');
          return;
        }
        if (data.password !== data.confirmPassword) {
          setErrorMessage('The new passwords do not match.');
          return;
        }
        role = challengeRole;
        await completeNewPasswordSignIn(
          { email: challengeEmail, password: data.password },
          challengeRole,
        );
      } else {
        const result = await loginUser({ email: data.email, password: data.password }, data.role);
        if ('challenge' in result && result.challenge === 'NEW_PASSWORD_REQUIRED') {
          setChallengeEmail(data.email);
          setChallengeRole(data.role);
          setNewPasswordRequired(true);
          setValue('password', '');
          setValue('confirmPassword', '');
          return;
        }
      }

      if (role === 'reviewer') {
        navigate('/reviewer/dashboard');
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 flex flex-col justify-between">
      {/* Banking Top Header */}
      <header className="bg-sbi-dark text-white border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sbi-blue to-sbi-accent flex items-center justify-center text-white shadow-md border border-blue-400/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-extrabold text-base tracking-tight text-white leading-none">
                Pramāṇa
              </h1>
              <p className="text-[10px] text-blue-200 tracking-wider uppercase font-semibold mt-0.5">
                Modern Automated Banking KYC Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-300">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline font-medium">Official Banking Gateway</span>
          </div>
        </div>
      </header>

      {/* Main Login Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 flex items-center justify-center">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Hero Card - SBI YONO Style Banner */}
          <div className="lg:col-span-6 bg-gradient-to-br from-sbi-navy via-sbi-blue to-navy-950 p-8 sm:p-10 rounded-3xl text-white shadow-2xl relative overflow-hidden border border-slate-700/50">
            <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-sbi-accent/20 rounded-full blur-3xl pointer-events-none" />
            
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold mb-6 border border-blue-400/30">
              <Building2 className="w-3.5 h-3.5" />
              RBI Compliant Digital Onboarding
            </div>

            <h2 className="text-3xl font-extrabold leading-tight tracking-tight">
              Instant, AI-Driven Identity Verification.
            </h2>
            <p className="text-slate-300 text-sm mt-3 leading-relaxed">
              Experience seamless verification with Pramāṇa’s OCR neural extraction, comparing government credentials against core banking databases in seconds.
            </p>

            <div className="mt-8 space-y-3.5 text-xs text-slate-200">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Zero-wait automated approval for matching Aadhaar & PAN</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Encrypted direct-to-S3 presigned document uploading</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Bank-grade human reviewer exception desk</span>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>Security Level: Tier-1 Bank</span>
              <span>ISO/IEC 27001</span>
            </div>
          </div>

          {/* Right Login Card */}
          <div className="lg:col-span-6 bg-white p-8 sm:p-10 rounded-3xl shadow-banking border border-slate-200/80">
            {/* Role Switcher */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl mb-6">
              <button
                type="button"
                onClick={() => setValue('role', 'customer')}
                disabled={newPasswordRequired}
                className={`py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                  selectedRole === 'customer'
                    ? 'bg-white text-sbi-blue shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                Customer Login
              </button>
              <button
                type="button"
                onClick={() => setValue('role', 'reviewer')}
                disabled={newPasswordRequired}
                className={`py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                  selectedRole === 'reviewer'
                    ? 'bg-white text-sbi-blue shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                Reviewer Portal
              </button>
            </div>

            <div className="mb-6">
              <h3 className="text-xl font-bold text-slate-900">
                {newPasswordRequired
                  ? 'Set Your Permanent Password'
                  : selectedRole === 'customer'
                    ? 'Sign In to Your Account'
                    : 'Reviewer Desk Authorization'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {newPasswordRequired
                  ? 'Your administrator-issued temporary password was accepted. Set a new password to finish signing in.'
                  : selectedRole === 'customer'
                    ? 'Access your KYC application, document upload, and real-time status.'
                    : 'Enter institutional credentials to inspect flagged KYC exceptions.'}
              </p>
            </div>

            {newPasswordRequired && (
              <p className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-900">
                The new password must be at least 8 characters and include uppercase and lowercase letters, a number, and a symbol.
              </p>
            )}

            {errorMessage && (
              <div className="mb-5">
                <ErrorAlert message={errorMessage} />
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Corporate / Registered Email
                </label>
                <input
                  type="email"
                  {...register('email')}
                  readOnly={newPasswordRequired}
                  placeholder={selectedRole === 'customer' ? 'name@example.com' : 'officer@bank.internal'}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sbi-accent focus:border-transparent transition-all shadow-sm"
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-rose-600 font-medium">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  {newPasswordRequired ? 'New Password' : 'Password'}
                </label>
                <input
                  type="password"
                  {...register('password')}
                  placeholder={newPasswordRequired ? 'Choose a strong new password' : '••••••••••••'}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sbi-accent focus:border-transparent transition-all shadow-sm"
                />
                {errors.password && (
                  <p className="mt-1 text-xs text-rose-600 font-medium">{errors.password.message}</p>
                )}
              </div>

              {newPasswordRequired && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    {...register('confirmPassword')}
                    placeholder="Enter the new password again"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sbi-accent focus:border-transparent transition-all shadow-sm"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-sbi-blue to-sbi-accent text-white font-bold text-sm hover:from-sbi-navy hover:to-blue-600 transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <span>Authenticating Session...</span>
                ) : (
                  <>
                    <span>{newPasswordRequired ? 'Set Password & Sign In' : 'Proceed Securely'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-xs">
              {selectedRole === 'customer' ? (
                <>
                  <span className="text-slate-500">First time applicant?</span>
                  <Link to="/register" className="font-bold text-sbi-accent hover:underline">
                    Create New Account
                  </Link>
                </>
              ) : (
                <div className="text-[11px] text-slate-400 text-center w-full">
                  Institutional reviewer accounts are configured via Cognito User Pool (us-east-1_IQzz0ktCu).
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Corporate Footer */}
      <footer className="bg-slate-900 text-slate-400 text-[11px] py-4 border-t border-slate-800 text-center">
        <p>© 2026 Pramāṇa Financial Verification Systems. All rights reserved. Secured by AWS Cloud Services.</p>
      </footer>
    </div>
  );
}
