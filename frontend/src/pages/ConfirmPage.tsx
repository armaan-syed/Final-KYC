import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { MailCheck, Lock, ArrowRight, ShieldCheck } from 'lucide-react';
import { confirmCustomerEmail } from '@/lib/auth';
import { ErrorAlert, SuccessAlert } from '@/components/ui/Alerts';

const confirmSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  code: z.string().length(6, 'Verification code must be exactly 6 digits'),
});

type ConfirmFormData = z.infer<typeof confirmSchema>;

export default function ConfirmPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const emailParam = searchParams.get('email') || '';

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConfirmFormData>({
    resolver: zodResolver(confirmSchema),
    defaultValues: {
      email: emailParam,
      code: '',
    },
  });

  const onSubmit = async (data: ConfirmFormData) => {
    setErrorMessage(null);
    setLoading(true);
    try {
      await confirmCustomerEmail(data.email, data.code);
      setSuccessMessage('Account verified successfully! Redirecting to login...');
      setTimeout(() => {
        navigate('/login');
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Verification failed. Please check the 6-digit OTP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between">
      <header className="bg-sbi-dark text-white border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sbi-blue to-sbi-accent flex items-center justify-center text-white">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="font-bold text-base tracking-tight text-white">Pramāṇa KYC</span>
          </div>
          <div className="text-xs text-slate-300 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            Email Verification
          </div>
        </div>
      </header>

      <main className="max-w-md w-full mx-auto px-4 py-12">
        <div className="bg-white rounded-3xl shadow-banking border border-slate-200/80 p-8 sm:p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 text-sbi-accent flex items-center justify-center mx-auto mb-4">
            <MailCheck className="w-7 h-7" />
          </div>

          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Verify Email Address
          </h2>
          <p className="text-xs text-slate-500 mt-1 mb-6">
            Enter the 6-digit confirmation code issued to your email by AWS Cognito.
          </p>

          {errorMessage && (
            <div className="mb-4 text-left">
              <ErrorAlert message={errorMessage} />
            </div>
          )}

          {successMessage && (
            <div className="mb-4 text-left">
              <SuccessAlert message={successMessage} />
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Registered Email
              </label>
              <input
                type="email"
                {...register('email')}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sbi-accent focus:outline-none"
              />
              {errors.email && (
                <p className="text-xs text-rose-600 mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                6-Digit Security Code
              </label>
              <input
                type="text"
                maxLength={6}
                {...register('code')}
                placeholder="123456"
                className="w-full text-center tracking-[0.4em] font-mono font-bold text-xl px-3.5 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sbi-accent focus:outline-none"
              />
              {errors.code && (
                <p className="text-xs text-rose-600 mt-1">{errors.code.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-sbi-blue to-sbi-accent text-white font-bold text-sm hover:from-sbi-navy hover:to-blue-600 transition shadow-lg shadow-blue-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? 'Verifying...' : 'Confirm & Proceed to Login'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </main>

      <footer className="bg-slate-900 text-slate-400 text-[11px] py-4 text-center">
        Pramāṇa Secure Identity Verification
      </footer>
    </div>
  );
}
