'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, FileUp, History, ArrowRight, User, AlertCircle } from 'lucide-react';
import { apiGetProfile, apiGetKYCStatus, getApiErrorMessage } from '@/lib/api';
import { CustomerProfile, KYCStatusResponse } from '@/types';
import { KYCStatusBadge } from '@/components/ui/KYCStatusBadge';
import { LoadingSpinner, ErrorAlert } from '@/components/ui/Alerts';
import { formatDate } from '@/lib/utils';

export default function CustomerDashboard() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [kycStatus, setKycStatus] = useState<KYCStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setError(null);
      const [profData, kycData] = await Promise.all([apiGetProfile(), apiGetKYCStatus()]);
      setProfile(profData);
      setKycStatus(kycData);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Polling when PROCESSING
  useEffect(() => {
    if (kycStatus?.status === 'PROCESSING') {
      const interval = setInterval(async () => {
        try {
          const freshStatus = await apiGetKYCStatus();
          setKycStatus(freshStatus);
        } catch {
          // Silent polling catch
        }
      }, 10000); // 10s poll per specification
      return () => clearInterval(interval);
    }
  }, [kycStatus?.status]);

  if (loading) {
    return <LoadingSpinner message="Loading customer dashboard..." />;
  }

  const status = kycStatus?.status || 'PENDING';
  const canUpload = status === 'PENDING' || status === 'REUPLOAD_PENDING' || status === 'REUPLOAD_REQUESTED';

  return (
    <div className="space-y-6">
      {/* Header welcome */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase font-bold tracking-wider text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
              Verified Customer
            </span>
          </div>
          <h1 className="text-2xl font-bold text-navy-950">
            Welcome back, {profile?.full_name || 'Customer'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {profile?.email} • {profile?.phone_number}
          </p>
        </div>

        {canUpload ? (
          <Link
            href="/kyc/upload"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-navy-900 text-white text-sm font-semibold hover:bg-navy-800 transition shadow-sm"
          >
            <FileUp className="w-4 h-4" />
            Upload Identity Document
          </Link>
        ) : (
          <Link
            href="/kyc/status"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-sm font-semibold transition border border-slate-300"
          >
            <History className="w-4 h-4" />
            View Attempt History
          </Link>
        )}
      </div>

      {error && <ErrorAlert message={error} onRetry={fetchData} />}

      {/* Main Status Showcase Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
            <h2 className="text-base font-bold text-navy-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              KYC Verification Status
            </h2>
            <KYCStatusBadge status={status} />
          </div>

          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-start gap-4">
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Active Case ID
                </p>
                <p className="font-mono text-sm font-medium text-slate-800 mt-0.5">
                  {kycStatus?.kyc_case_id || 'Not initiated'}
                </p>
              </div>

              {kycStatus?.latest_attempt && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Document Submitted
                  </p>
                  <p className="text-sm font-bold text-navy-900 mt-0.5">
                    {kycStatus.latest_attempt.document_type} (Attempt #{kycStatus.latest_attempt.attempt_number})
                  </p>
                </div>
              )}
            </div>

            {status === 'PROCESSING' && (
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-sm flex items-start gap-3">
                <LoadingSpinner className="p-0 text-blue-600" message="" />
                <div>
                  <p className="font-semibold">Automated OCR and Field Verification in progress</p>
                  <p className="text-xs text-blue-700 mt-1">
                    Our OCR engine is extracting your data and comparing against your profile. This page updates automatically.
                  </p>
                </div>
              </div>
            )}

            {status === 'REJECTED' && kycStatus?.rejection_reason && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Verification was rejected by reviewer</p>
                  <p className="text-xs text-rose-700 mt-1">
                    Reason: {kycStatus.rejection_reason}
                  </p>
                </div>
              </div>
            )}

            {(status === 'REUPLOAD_PENDING' || status === 'REUPLOAD_REQUESTED') && (
              <div className="p-4 rounded-xl bg-orange-50 border border-orange-200 text-orange-900 text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Re-upload Required</p>
                  <p className="text-xs text-orange-700 mt-1">
                    Your previous document had unclear text or field discrepancies. Please upload a clear photo or PDF scan.
                  </p>
                </div>
              </div>
            )}

            {(status === 'AUTO_VERIFIED' || status === 'APPROVED') && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Your identity has been fully verified!</p>
                  <p className="text-xs text-emerald-700 mt-1">
                    Your Pramāṇa KYC record is complete and meets all banking compliance requirements.
                  </p>
                </div>
              </div>
            )}

            <div className="pt-2 flex gap-3">
              <Link
                href="/kyc/status"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-navy-800 hover:text-navy-950 hover:underline"
              >
                <span>View Full Verification History</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Profile Card Summary */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-navy-900 flex items-center gap-2 pb-4 border-b border-slate-100 mb-4">
              <User className="w-5 h-5 text-slate-500" />
              Registered Profile
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs text-slate-500 block">Date of Birth</span>
                <span className="font-medium text-slate-800">{profile?.date_of_birth}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Gender</span>
                <span className="font-medium text-slate-800">{profile?.gender}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Registered Address</span>
                <span className="font-medium text-slate-800 text-xs">
                  {profile?.address_line1}
                  {profile?.address_line2 ? `, ${profile.address_line2}` : ''}, {profile?.city},{' '}
                  {profile?.state} - {profile?.pincode}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-400">
            Profile updates must match government-issued identification.
          </div>
        </div>
      </div>
    </div>
  );
}
