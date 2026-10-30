import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ShieldCheck, ArrowRight, Lock, Building2, UserPlus, Info } from 'lucide-react';
import { apiRegister, getApiErrorMessage } from '@/lib/api';
import { ErrorAlert } from '@/components/ui/Alerts';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { ALL_INDIAN_STATES, INDIAN_STATES_AND_CITIES } from '@/lib/indiaLocations';

const registerSchema = z
  .object({
    full_name: z.string().min(2, 'Official name as shown on Aadhaar / PAN is required'),
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
    pincode: z.string().regex(/^\d{6}$/, 'Must be a 6-digit Indian postal code'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      gender: 'Male',
      phone_number: '+91',
      state: '',
      city: '',
    },
  });

  const selectedState = watch('state');
  const selectedCity = watch('city');

  const availableCities = selectedState && INDIAN_STATES_AND_CITIES[selectedState]
    ? INDIAN_STATES_AND_CITIES[selectedState]
    : [];

  const onSubmit = async (data: RegisterFormData) => {
    setErrorMessage(null);
    setLoading(true);
    try {
      const { confirmPassword, ...payload } = data;
      await apiRegister(payload);
      navigate(`/confirm?email=${encodeURIComponent(payload.email)}`);
    } catch (err: any) {
      setErrorMessage(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between">
      {/* Header */}
      <header className="bg-sbi-dark text-white border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <Link to="/login" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sbi-blue to-sbi-accent flex items-center justify-center text-white">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="font-bold text-base tracking-tight text-white">Pramāṇa KYC</span>
          </Link>
          <div className="text-xs text-slate-300 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            Secure Customer Enrollment
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-10">
        <div className="bg-white rounded-3xl shadow-banking border border-slate-200/80 p-8 sm:p-10">
          
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-sbi-accent flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Customer KYC Registration
              </h2>
              <p className="text-xs text-slate-500">
                Please enter your information strictly matching your Aadhaar or PAN card.
              </p>
            </div>
          </div>

          <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 mb-8 flex items-start gap-3 text-xs text-blue-900">
            <Info className="w-4 h-4 text-sbi-accent flex-shrink-0 mt-0.5" />
            <p>
              <strong>Verification Requirement:</strong> Our OCR engine compares your name and date of birth on Aadhaar and PAN, plus gender on Aadhaar. Ensure these details match your documents.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-6">
              <ErrorAlert message={errorMessage} />
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            
            {/* Section 1: Identification */}
            <div>
              <h3 className="text-xs font-bold text-sbi-blue uppercase tracking-wider mb-4 pb-2 border-b border-slate-100">
                1. Personal Identity Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Full Legal Name *
                  </label>
                  <input
                    type="text"
                    {...register('full_name')}
                    placeholder="e.g. ARMAAN SYED"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sbi-accent focus:outline-none uppercase"
                  />
                  {errors.full_name && (
                    <p className="text-xs text-rose-600 mt-1">{errors.full_name.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    {...register('date_of_birth')}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sbi-accent focus:outline-none"
                  />
                  {errors.date_of_birth && (
                    <p className="text-xs text-rose-600 mt-1">{errors.date_of_birth.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Gender *</label>
                  <select
                    {...register('gender')}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sbi-accent focus:outline-none bg-white"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mobile Number (+91) *
                  </label>
                  <input
                    type="text"
                    {...register('phone_number')}
                    placeholder="+919876543210"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sbi-accent focus:outline-none"
                  />
                  {errors.phone_number && (
                    <p className="text-xs text-rose-600 mt-1">{errors.phone_number.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Section 2: Address */}
            <div>
              <h3 className="text-xs font-bold text-sbi-blue uppercase tracking-wider mb-4 pb-2 border-b border-slate-100">
                2. Residential Address
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Address Line 1 *
                  </label>
                  <input
                    type="text"
                    {...register('address_line1')}
                    placeholder="House / Flat No, Building Name, Street"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sbi-accent focus:outline-none"
                  />
                  {errors.address_line1 && (
                    <p className="text-xs text-rose-600 mt-1">{errors.address_line1.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Address Line 2 (Optional)
                  </label>
                  <input
                    type="text"
                    {...register('address_line2')}
                    placeholder="Locality, Landmark"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sbi-accent focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <SearchableSelect
                      label="State"
                      required
                      value={selectedState}
                      options={ALL_INDIAN_STATES}
                      placeholder="Select State"
                      error={errors.state?.message}
                      onChange={(val) => {
                        setValue('state', val, { shouldValidate: true });
                        setValue('city', '', { shouldValidate: true });
                      }}
                    />
                  </div>

                  <div>
                    <SearchableSelect
                      label="City"
                      required
                      value={selectedCity}
                      options={availableCities}
                      disabled={!selectedState}
                      placeholder={selectedState ? 'Select City' : 'Select State first'}
                      error={errors.city?.message}
                      onChange={(val) => {
                        setValue('city', val, { shouldValidate: true });
                      }}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Pincode (6 digits) *
                    </label>
                    <input
                      type="text"
                      {...register('pincode')}
                      placeholder="400020"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sbi-accent focus:outline-none"
                    />
                    {errors.pincode && (
                      <p className="text-xs text-rose-600 mt-1">{errors.pincode.message}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Credentials */}
            <div>
              <h3 className="text-xs font-bold text-sbi-blue uppercase tracking-wider mb-4 pb-2 border-b border-slate-100">
                3. Security & Access Credentials
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    {...register('email')}
                    placeholder="name@example.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sbi-accent focus:outline-none"
                  />
                  {errors.email && (
                    <p className="text-xs text-rose-600 mt-1">{errors.email.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Password (min. 8 characters) *
                    </label>
                    <input
                      type="password"
                      {...register('password')}
                      placeholder="••••••••••••"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sbi-accent focus:outline-none"
                    />
                    {errors.password && (
                      <p className="text-xs text-rose-600 mt-1">{errors.password.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Confirm Password *
                    </label>
                    <input
                      type="password"
                      {...register('confirmPassword')}
                      placeholder="••••••••••••"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sbi-accent focus:outline-none"
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
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-sbi-blue to-sbi-accent text-white font-bold text-sm hover:from-sbi-navy hover:to-blue-600 transition shadow-lg shadow-blue-900/20 disabled:opacity-50"
            >
              {loading ? 'Creating Verification Account...' : 'Submit Registration'}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-500">
            Already registered?{' '}
            <Link to="/login" className="font-bold text-sbi-accent hover:underline">
              Sign In to Your Dashboard
            </Link>
          </div>
        </div>
      </main>

      <footer className="bg-slate-900 text-slate-400 text-[11px] py-4 text-center">
        Pramāṇa Secure Customer Onboarding
      </footer>
    </div>
  );
}
