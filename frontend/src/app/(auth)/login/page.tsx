'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ShieldCheck, ArrowRight, UserCheck } from 'lucide-react';
import { loginUser } from '@/lib/auth';
import { ErrorAlert } from '@/components/ui/Alerts';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['customer', 'reviewer']),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      role: 'customer',
    },
  });

  const selectedRole = watch('role');

  const onSubmit = async (data: LoginFormData) => {
    setErrorMessage(null);
    setLoading(true);
    try {
      const res = await loginUser(
        { email: data.email, password: data.password },
        data.role
      );

      if (data.role === 'reviewer') {
        router.push('/reviewer/dashboard');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-navy-900 text-white shadow-lg mb-4">
          <ShieldCheck className="w-8 h-8 text-blue-400" />
        </div>
        <h2 className="text-3xl font-extrabold text-navy-950 tracking-tight">Pramāṇa</h2>
        <p className="mt-2 text-sm text-slate-600 font-medium">
          Automated Banking KYC Verification Platform
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl shadow-slate-200/50 sm:rounded-2xl sm:px-10 border border-slate-200">
          {/* Role selector tab */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg mb-6">
            <button
              type="button"
              onClick={() => setValue('role', 'customer')}
              className={`py-2 text-xs font-semibold rounded-md transition ${
                selectedRole === 'customer'
                  ? 'bg-white text-navy-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Customer Sign In
            </button>
            <button
              type="button"
              onClick={() => setValue('role', 'reviewer')}
              className={`py-2 text-xs font-semibold rounded-md transition ${
                selectedRole === 'reviewer'
                  ? 'bg-white text-navy-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Reviewer Portal
            </button>
          </div>

          {errorMessage && (
            <div className="mb-4">
              <ErrorAlert message={errorMessage} />
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Email Address
              </label>
              <input
                type="email"
                {...register('email')}
                placeholder={selectedRole === 'customer' ? 'name@example.com' : 'reviewer@bank.internal'}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-navy-800 text-sm"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-rose-600 font-medium">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Password
              </label>
              <input
                type="password"
                {...register('password')}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-navy-800 text-sm"
              />
              {errors.password && (
                <p className="mt-1 text-xs text-rose-600 font-medium">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-navy-900 hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-navy-900 transition disabled:opacity-50"
            >
              {loading ? (
                'Signing in...'
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {selectedRole === 'customer' ? (
            <div className="mt-6 text-center text-xs text-slate-600">
              New customer?{' '}
              <Link href="/register" className="font-semibold text-navy-800 hover:underline">
                Create an account
              </Link>
            </div>
          ) : (
            <div className="mt-6 text-center text-xs text-slate-500">
              Reviewer accounts are strictly provisioned by system administrators.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
