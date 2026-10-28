'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { apiRegister } from '@/lib/api';
import { ErrorAlert } from '@/components/ui/Alerts';

const registerSchema = z
  .object({
    full_name: z.string().min(2, 'Full name is required (as per Aadhaar/PAN)'),
    date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD'),
    gender: z.enum(['Male', 'Female', 'Other']),
    phone_number: z.string().regex(/^\+91[6-9]\d{9}$/, 'Must be valid Indian mobile (+91XXXXXXXXXX)'),
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters with numbers & symbols'),
    confirmPassword: z.string(),
    address_line1: z.string().min(3, 'Address line 1 is required'),
    address_line2: z.string().optional(),
    city: z.string().min(2, 'City is required'),
    state: z.string().min(2, 'State is required'),
    pincode: z.string().regex(/^\d{6}$/, 'Must be a 6-digit Indian pincode'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      gender: 'Male',
      phone_number: '+91',
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    setErrorMessage(null);
    setLoading(true);
    try {
      const { confirmPassword, ...payload } = data;
      // The backend creates the customer row after Cognito confirmation.
      await apiRegister(payload);
      router.push(`/confirm?email=${encodeURIComponent(payload.email)}`);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to complete registration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-navy-900 text-white shadow-md mb-3">
          <ShieldCheck className="w-6 h-6 text-blue-400" />
        </div>
        <h2 className="text-2xl font-extrabold text-navy-950">Customer Registration</h2>
        <p className="mt-1 text-sm text-slate-600">
          Enter your official details exactly as they appear on your government identity card.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="bg-white py-8 px-6 shadow-xl shadow-slate-200/50 sm:rounded-2xl sm:px-10 border border-slate-200">
          {errorMessage && (
            <div className="mb-6">
              <ErrorAlert message={errorMessage} />
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            {/* Personal Details */}
            <div>
              <h3 className="text-xs font-bold text-navy-800 uppercase tracking-wider mb-4 border-b pb-2">
                Personal Identification
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name (as per ID) *
                  </label>
                  <input
                    type="text"
                    {...register('full_name')}
                    placeholder="ARMAAN SYED"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-navy-800 focus:outline-none"
                  />
                  {errors.full_name && (
                    <p className="text-xs text-rose-600 mt-1">{errors.full_name.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    {...register('date_of_birth')}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-navy-800 focus:outline-none"
                  />
                  {errors.date_of_birth && (
                    <p className="text-xs text-rose-600 mt-1">{errors.date_of_birth.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Gender *
                  </label>
                  <select
                    {...register('gender')}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-navy-800 focus:outline-none"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number (+91) *
                  </label>
                  <input
                    type="text"
                    {...register('phone_number')}
                    placeholder="+919876543210"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-navy-800 focus:outline-none"
                  />
                  {errors.phone_number && (
                    <p className="text-xs text-rose-600 mt-1">{errors.phone_number.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Address */}
            <div>
              <h3 className="text-xs font-bold text-navy-800 uppercase tracking-wider mb-4 border-b pb-2">
                Residential Address
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Address Line 1 *
                  </label>
                  <input
                    type="text"
                    {...register('address_line1')}
                    placeholder="123 Marine Lines"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-navy-800 focus:outline-none"
                  />
                  {errors.address_line1 && (
                    <p className="text-xs text-rose-600 mt-1">{errors.address_line1.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Address Line 2 (Optional)
                  </label>
                  <input
                    type="text"
                    {...register('address_line2')}
                    placeholder="Flat 4B, Ocean View"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-navy-800 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      City *
                    </label>
                    <input
                      type="text"
                      {...register('city')}
                      placeholder="Mumbai"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-navy-800 focus:outline-none"
                    />
                    {errors.city && (
                      <p className="text-xs text-rose-600 mt-1">{errors.city.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      State *
                    </label>
                    <input
                      type="text"
                      {...register('state')}
                      placeholder="Maharashtra"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-navy-800 focus:outline-none"
                    />
                    {errors.state && (
                      <p className="text-xs text-rose-600 mt-1">{errors.state.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Pincode *
                    </label>
                    <input
                      type="text"
                      {...register('pincode')}
                      placeholder="400020"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-navy-800 focus:outline-none"
                    />
                    {errors.pincode && (
                      <p className="text-xs text-rose-600 mt-1">{errors.pincode.message}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Account Credentials */}
            <div>
              <h3 className="text-xs font-bold text-navy-800 uppercase tracking-wider mb-4 border-b pb-2">
                Account Credentials
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    {...register('email')}
                    placeholder="armaan@example.com"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-navy-800 focus:outline-none"
                  />
                  {errors.email && (
                    <p className="text-xs text-rose-600 mt-1">{errors.email.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Password *
                    </label>
                    <input
                      type="password"
                      {...register('password')}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-navy-800 focus:outline-none"
                    />
                    {errors.password && (
                      <p className="text-xs text-rose-600 mt-1">{errors.password.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Confirm Password *
                    </label>
                    <input
                      type="password"
                      {...register('confirmPassword')}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-navy-800 focus:outline-none"
                    />
                    {errors.confirmPassword && (
                      <p className="text-xs text-rose-600 mt-1">{errors.confirmPassword.message}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-lg bg-navy-900 text-white font-semibold hover:bg-navy-800 transition shadow-sm text-sm disabled:opacity-50"
            >
              {loading ? 'Creating Account...' : 'Register Account'}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-600">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-navy-800 hover:underline">
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
