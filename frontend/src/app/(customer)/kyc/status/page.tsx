'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, History, ArrowLeft, RefreshCw, AlertCircle, FileCheck2 } from 'lucide-react';
import { apiGetKYCStatus, getApiErrorMessage } from '@/lib/api';
import { KYCStatusResponse } from '@/types';
import { KYCStatusBadge } from '@/components/ui/KYCStatusBadge';
import { LoadingSpinner, ErrorAlert } from '@/components/ui/Alerts';
import { formatDate, formatFieldLabel } from '@/lib/utils';

export default function KYCStatusHistoryPage() {
  const [kycStatus, setKycStatus] = useState<KYCStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setError(null);
      const data = await apiGetKYCStatus();
      setKycStatus(data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  if (loading) {
    return <LoadingSpinner message="Loading verification history..." />;
  }

  const latest = kycStatus?.latest_attempt;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-navy-900 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-navy-950">KYC Status & Attempt History</h1>
            <p className="text-sm text-slate-500">
              Track the full lifecycle and audit results of your identity verification.
            </p>
          </div>
        </div>

        <button
          onClick={fetchStatus}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {error && <ErrorAlert message={error} onRetry={fetchStatus} />}

      {/* Case Overview Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs uppercase font-bold text-slate-400">KYC Case Reference</span>
          <p className="font-mono text-base font-bold text-slate-900 mt-0.5">
            {kycStatus?.kyc_case_id || 'Not Initiated'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-600">Current Status:</span>
          {kycStatus && <KYCStatusBadge status={kycStatus.status} />}
        </div>
      </div>

      {/* Rejection notice if present */}
      {kycStatus?.status === 'REJECTED' && kycStatus.rejection_reason && (
        <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-sm">Reviewer Rejection Notice</h3>
            <p className="text-sm mt-1">{kycStatus.rejection_reason}</p>
            <p className="text-xs text-rose-700 mt-2">
              Please contact bank support or initiate a re-upload if permitted.
            </p>
          </div>
        </div>
      )}

      {/* Latest Attempt Detailed Inspection */}
      {latest ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-navy-800" />
              <h2 className="text-base font-bold text-navy-950">
                Latest Attempt (Attempt #{latest.attempt_number})
              </h2>
            </div>
            <KYCStatusBadge status={latest.status} />
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-xs text-slate-400 block font-medium">Document Type</span>
                <span className="font-bold text-navy-900">{latest.document_type}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-xs text-slate-400 block font-medium">Submitted On</span>
                <span className="font-medium text-slate-800">{formatDate(latest.submitted_at)}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-xs text-slate-400 block font-medium">Completed On</span>
                <span className="font-medium text-slate-800">{formatDate(latest.completed_at)}</span>
              </div>
            </div>

            {/* Field comparison preview if available */}
            {latest.field_comparisons && latest.field_comparisons.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Verification Field Match Summary
                </h3>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {latest.field_comparisons.map((c) => (
                    <div
                      key={c.field}
                      className={`p-3.5 flex items-center justify-between text-sm ${
                        c.is_match ? 'bg-white' : 'bg-rose-50/60'
                      }`}
                    >
                      <div className="font-medium text-slate-800">
                        {formatFieldLabel(c.field)}
                      </div>
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          c.is_match
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {c.is_match ? 'Match Verified' : 'Discrepancy Found'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
          <History className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700">No attempts submitted yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Once you upload your identity document, full attempt and extraction details will be listed here.
          </p>
        </div>
      )}
    </div>
  );
}
