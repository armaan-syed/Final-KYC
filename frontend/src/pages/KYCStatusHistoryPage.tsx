import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  History,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  FileCheck2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
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
    return <LoadingSpinner message="Loading verification logs and match records..." />;
  }

  const latest = kycStatus?.latest_attempt;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-sbi-blue hover:border-slate-300 transition shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              KYC Status & Attempt History
            </h1>
            <p className="text-xs text-slate-500">
              Complete audit record of OCR extractions, matching, and determination history.
            </p>
          </div>
        </div>

        <button
          onClick={fetchStatus}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Status
        </button>
      </div>

      {error && <ErrorAlert message={error} onRetry={fetchStatus} />}

      {/* Case Overview */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-banking flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
            Case Identification Reference
          </span>
          <p className="font-mono text-base font-bold text-slate-900 mt-1">
            {kycStatus?.kyc_case_id || 'Not Initiated'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Current Case State:
          </span>
          {kycStatus && <KYCStatusBadge status={kycStatus.status} />}
        </div>
      </div>

      {/* Rejection Notification if present */}
      {kycStatus?.status === 'REJECTED' && kycStatus.rejection_reason && (
        <div className="p-6 rounded-3xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-4 shadow-sm">
          <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-sm">Reviewer Rejection Reason</h3>
            <p className="text-sm mt-1 text-rose-800">{kycStatus.rejection_reason}</p>
            <p className="text-xs text-rose-700 mt-2 font-medium">
              You may submit a fresh registration or contact your branch manager.
            </p>
          </div>
        </div>
      )}

      {/* Latest Attempt Card */}
      {latest ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-banking overflow-hidden">
          <div className="p-6 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-100 text-sbi-blue flex items-center justify-center">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Attempt #{latest.attempt_number}
                </h3>
                <span className="text-xs text-slate-500">Document Type: {latest.document_type}</span>
              </div>
            </div>
            <KYCStatusBadge status={latest.status} />
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-slate-400 font-semibold block uppercase text-[10px]">
                  Submitted At
                </span>
                <span className="font-bold text-slate-800 mt-0.5 block text-xs">
                  {formatDate(latest.submitted_at)}
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-slate-400 font-semibold block uppercase text-[10px]">
                  Completed At
                </span>
                <span className="font-bold text-slate-800 mt-0.5 block text-xs">
                  {formatDate(latest.completed_at)}
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <span className="text-slate-400 font-semibold block uppercase text-[10px]">
                  Resulting Determination
                </span>
                <span className="font-bold text-slate-800 mt-0.5 block text-xs">
                  {latest.status}
                </span>
              </div>
            </div>

            {/* Field comparison preview */}
            {latest.field_comparisons && latest.field_comparisons.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-sbi-blue mb-3">
                  Automated OCR Field Match Report
                </h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  {latest.field_comparisons.map((c) => (
                    (() => {
                      const result = c.status ?? (c.is_match ? 'MATCH' : 'REVIEW_REQUIRED');
                      const matched = result === 'MATCH';
                      const needsReview = result === 'REVIEW_REQUIRED' || result === 'NOT_EXTRACTED';
                      return (
                        <div
                          key={c.field}
                          className={`p-4 flex items-center justify-between text-xs transition-colors ${
                            matched ? 'bg-white' : needsReview ? 'bg-amber-50/50' : 'bg-rose-50/50'
                          }`}
                        >
                          <div className="font-bold text-slate-800">
                            {formatFieldLabel(c.field)}
                          </div>
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                              matched
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : needsReview
                                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                                  : 'bg-rose-50 text-rose-800 border-rose-200'
                            }`}
                          >
                            {matched ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                Match
                              </>
                            ) : needsReview ? (
                              <>Needs Review</>
                            ) : (
                              <>
                                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                                Mismatch
                              </>
                            )}
                          </span>
                        </div>
                      );
                    })()
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 shadow-banking">
          <History className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No attempts logged yet</h3>
          <p className="text-xs text-slate-500 mt-1">
            Once you upload your first document, extraction records will be rendered here.
          </p>
        </div>
      )}
    </div>
  );
}
