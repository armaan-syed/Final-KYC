'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ShieldCheck, MailCheck } from 'lucide-react';
import { confirmCustomerEmail } from '@/lib/auth';
import { ErrorAlert, SuccessAlert } from '@/components/ui/Alerts';

const confirmSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  code: z.string().length(6, 'Verification code must be exactly 6 digits'),
});

type ConfirmFormData = z.infer<typeof confirmSchema>;

function ConfirmForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
      setSuccessMessage('Account confirmed successfully! Redirecting to login...');
      setTimeout(() => {
        router.push('/login');
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Verification failed. Please check the code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white py-8 px-6 shadow-xl shadow-slate-200/50 sm:rounded-2xl sm:px-10 border border-slate-200">
      {errorMessage && (
        <div className="mb-4">
          <ErrorAlert message={errorMessage} />
        </div>
      )}

      {successMessage && (
        <div className="mb-4">
          <SuccessAlert message={successMessage} />
        </div>
      )}

      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Registered Email
          </label>
          <input
            type="email"
            {...register('email')}
            placeholder="name@example.com"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-navy-800 text-sm"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-rose-600 font-medium">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            6-Digit Verification Code
          </label>
          <input
            type="text"
            maxLength={6}
            {...register('code')}
            placeholder="123456"
            className="w-full tracking-widest text-center text-lg font-bold px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-navy-800"
          />
          {errors.code && (
            <p className="mt-1 text-xs text-rose-600 font-medium">{errors.code.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 rounded-lg bg-navy-900 text-white font-semibold hover:bg-navy-800 transition shadow-sm text-sm disabled:opacity-50"
        >
          {loading ? 'Verifying...' : 'Verify Email & Proceed'}
        </button>
      </form>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-navy-900 text-white shadow-lg mb-4">
          <MailCheck className="w-8 h-8 text-blue-400" />
        </div>
        <h2 className="text-2xl font-extrabold text-navy-950">Verify Your Email</h2>
        <p className="mt-1 text-sm text-slate-600 font-medium">
          Enter the 6-digit confirmation code sent to your email by AWS Cognito.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Suspense fallback={<div className="text-center text-sm">Loading confirmation...</div>}>
          <ConfirmForm />
        </Suspense>
      </div>
    </div>
  );
}
