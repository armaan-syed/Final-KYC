import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  FileUp,
  History,
  ArrowRight,
  User,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { apiGetProfile, apiGetKYCStatus, getApiErrorMessage } from '@/lib/api';
import { CustomerProfile, KYCStatusResponse, KYCStatus } from '@/types';
import { KYCStatusBadge } from '@/components/ui/KYCStatusBadge';
import { LoadingSpinner, ErrorAlert } from '@/components/ui/Alerts';

export default function CustomerDashboardPage() {
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

  // Polling every 10 seconds during PROCESSING state
  useEffect(() => {
    if (kycStatus?.status === 'PROCESSING') {
      const interval = setInterval(async () => {
        try {
          const fresh = await apiGetKYCStatus();
          setKycStatus(fresh);
        } catch {
          // Silent polling
        }
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [kycStatus?.status]);

  if (loading) {
    return <LoadingSpinner message="Retrieving institutional KYC record..." />;
  }

  const status: KYCStatus = kycStatus?.status || 'PENDING';
  const canUpload =
    kycStatus?.upload_allowed ??
    ((status as string) === 'PENDING' ||
      (status as string) === 'REUPLOAD_PENDING' ||
      (status as string) === 'REUPLOAD_REQUESTED' ||
      status === 'APPROVED' ||
      status === 'REJECTED' ||
      status === 'AUTO_VERIFIED');

  return (
    <div className="space-y-8">
      {/* Banking Welcome Banner with YONO aesthetic gradient */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-sbi-dark via-sbi-blue to-navy-900 text-white p-8 sm:p-10 shadow-banking border border-slate-800">
        <div className="absolute right-0 top-0 w-80 h-full bg-sbi-accent/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold border border-blue-400/30">
              <Sparkles className="w-3.5 h-3.5" />
              Verified Digital Customer
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Welcome, {profile?.full_name || 'Customer'}
            </h1>
            <p className="text-xs text-slate-300 flex flex-wrap items-center gap-2">
              <span>{profile?.email}</span>
              <span>•</span>
              <span>{profile?.phone_number}</span>
              <span>•</span>
              <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-blue-300">
                A/C Ref: {profile?.id.substring(0, 13)}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {canUpload ? (
              <Link
                to="/kyc/upload"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-sbi-accent to-blue-500 hover:from-blue-600 hover:to-sbi-accent text-white font-bold text-xs uppercase tracking-wider transition-all duration-200 shadow-lg shadow-blue-900/40 hover:scale-[1.02]"
              >
                <FileUp className="w-4 h-4" />
                Upload KYC Document
              </Link>
            ) : (
              <Link
                to="/kyc/status"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-slate-800/90 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider transition-all border border-slate-700 shadow-sm"
              >
                <History className="w-4 h-4" />
                View Detailed Logs
              </Link>
            )}
          </div>
        </div>
      </div>

      {error && <ErrorAlert message={error} onRetry={fetchData} />}

      {/* Main Grid: Status Hero & Profile Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Verification Status Card */}
        <div className="lg:col-span-8 bg-white rounded-3xl p-8 shadow-banking border border-slate-200/80 transition-all hover:shadow-banking-hover">
          <div className="flex items-center justify-between pb-6 border-b border-slate-100 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-sbi-accent flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">KYC Verification Status</h2>
                <p className="text-xs text-slate-500">Live determination state from core banking engine</p>
              </div>
            </div>
            <KYCStatusBadge status={status} />
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  Active Case Reference
                </span>
                <span className="font-mono text-sm font-bold text-slate-800 mt-1 block">
                  {kycStatus?.kyc_case_id || 'Case Not Registered'}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  Submitted Document
                </span>
                <span className="text-sm font-bold text-slate-800 mt-1 block">
                  {kycStatus?.latest_attempt
                    ? `${kycStatus.latest_attempt.document_type} (Attempt #${kycStatus.latest_attempt.attempt_number})`
                    : 'Awaiting Upload'}
                </span>
              </div>
            </div>

            {/* Dynamic Status Action Blocks */}
            {status === 'PROCESSING' && kycStatus?.upload_allowed && (
              <div className="p-5 rounded-2xl bg-blue-50/80 border border-blue-200 text-blue-950 flex items-start gap-4">
                <Clock className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-sm">Complete Your Document Upload</h4>
                  <p className="text-xs text-blue-800 mt-1 leading-relaxed">
                    Your upload has not been submitted for review yet. Continue the upload from this page; you may retry without creating another attempt.
                  </p>
                </div>
              </div>
            )}
            {status === 'PROCESSING' && !kycStatus?.upload_allowed && (
              <div className="p-5 rounded-2xl bg-blue-50/80 border border-blue-200 text-blue-950 flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center animate-spin flex-shrink-0 mt-0.5">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">Automated OCR Extraction & Matching in Progress</h4>
                  <p className="text-xs text-blue-800 mt-1 leading-relaxed">
                    Our OCR pipeline is parsing your document image and matching fields against core bank customer records. This screen refreshes every 10 seconds automatically.
                  </p>
                </div>
              </div>
            )}

            {status === 'REVIEW_REQUIRED' && (
              <div className="p-5 rounded-2xl bg-amber-50/80 border border-amber-200 text-amber-950 flex items-start gap-4">
                <Clock className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-sm">Awaiting Reviewer Review</h4>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    Your document is with a reviewer. Please wait for the decision; another upload will be available only if the reviewer requests a re-upload.
                  </p>
                </div>
              </div>
            )}
            {(status === 'AUTO_VERIFIED' || status === 'APPROVED') && (
              <div className="p-5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-emerald-950 flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">Full Verification Complete</h4>
                  <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                    Your government identity document has been verified successfully. You can upload another document if you need to start a new KYC review.
                  </p>
                </div>
              </div>
            )}

            {(status === 'REUPLOAD_PENDING' || (status as string) === 'REUPLOAD_REQUESTED') && (
              <div className="p-5 rounded-2xl bg-orange-50/80 border border-orange-200 text-orange-950 flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-orange-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">Re-upload Requested by Reviewer</h4>
                  <p className="text-xs text-orange-800 mt-1 leading-relaxed">
                    The reviewer flagged blurry text or field mismatches on your previous submission. Please provide a clear, glare-free photo or PDF.
                  </p>
                  <Link
                    to="/kyc/upload"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-900 mt-3 hover:underline"
                  >
                    <span>Upload Replacement Document</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )}

            {status === 'REJECTED' && (
              <div className="p-5 rounded-2xl bg-rose-50/80 border border-rose-200 text-rose-950 flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">Verification Non-Compliant</h4>
                  <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                    Reason: {kycStatus?.rejection_reason || 'Discrepancy between registered information and identity card.'} You can upload another document to start a new review.
                  </p>
                </div>
              </div>
            )}

            <div className="pt-2">
              <Link
                to="/kyc/status"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-sbi-accent hover:text-blue-800 transition"
              >
                <span>Inspect full verification history & comparisons</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* Registered Customer Profile Card */}
        <div className="lg:col-span-4 bg-white rounded-3xl p-8 shadow-banking border border-slate-200/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100 mb-5">
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Registered Profile</h3>
                <p className="text-[11px] text-slate-500">Core Bank Records</p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">
                  Date of Birth
                </span>
                <span className="text-slate-900 font-bold text-sm mt-0.5 block">
                  {profile?.date_of_birth}
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">
                  Gender
                </span>
                <span className="text-slate-900 font-bold text-sm mt-0.5 block">
                  {profile?.gender}
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">
                  Residential Address
                </span>
                <span className="text-slate-700 font-medium leading-relaxed mt-0.5 block">
                  {profile?.address_line1}
                  {profile?.address_line2 ? `, ${profile.address_line2}` : ''}, {profile?.city},{' '}
                  {profile?.state} - {profile?.pincode}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-slate-100 text-[11px] text-slate-400 leading-normal">
            Identity tokens are securely stored and verified against UIDAI / NSDL databases.
          </div>
        </div>
      </div>
    </div>
  );
}
