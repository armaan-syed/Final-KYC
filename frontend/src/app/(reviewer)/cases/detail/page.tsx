'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  RotateCcw,
  User,
  FileText,
  Clock,
  ShieldAlert,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { apiGetCaseDetail, apiSubmitDecision, getApiErrorMessage } from '@/lib/api';
import { CaseDetail, DecisionType } from '@/types';
import { KYCStatusBadge } from '@/components/ui/KYCStatusBadge';
import { LoadingSpinner, ErrorAlert, SuccessAlert } from '@/components/ui/Alerts';
import { formatDate, formatFieldLabel } from '@/lib/utils';

function CaseDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const caseId = searchParams.get('caseId') || 'case-9821-432a-bc12';

  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [decisionFeedback, setDecisionFeedback] = useState<string | null>(null);

  const fetchDetail = async () => {
    try {
      setError(null);
      const data = await apiGetCaseDetail(caseId);
      setDetail(data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (caseId) fetchDetail();
  }, [caseId]);

  const handleDecision = async (decision: DecisionType) => {
    if (!detail) return;
    setSubmittingDecision(true);
    setDecisionFeedback(null);
    setError(null);

    try {
      const res = await apiSubmitDecision(detail.kyc_case_id, {
        decision,
        notes: decisionNotes,
      });
      setDecisionFeedback(`Decision recorded: ${res.status}. Refreshing case status...`);
      setTimeout(() => {
        fetchDetail();
      }, 1000);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmittingDecision(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading case details..." />;
  }

  if (!detail) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Case not found.</p>
        <Link href="/reviewer/queue" className="text-sm font-semibold text-blue-600 underline mt-2 inline-block">
          Return to Queue
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/reviewer/queue"
            className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-navy-900 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-navy-950 font-mono">
                {detail.kyc_case_id}
              </h1>
              <KYCStatusBadge status={detail.status} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Customer: {detail.customer.full_name}
            </p>
          </div>
        </div>
      </div>

      {error && <ErrorAlert message={error} onRetry={fetchDetail} />}
      {decisionFeedback && <SuccessAlert message={decisionFeedback} />}

      {/* Grid: Customer Data vs Document Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Database Profile */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-navy-900 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600" />
              Customer Database Profile
            </h2>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase">Registered Name</span>
                <p className="font-semibold text-slate-900">{detail.customer.full_name}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase">Date of Birth</span>
                  <p className="font-semibold text-slate-900">{detail.customer.date_of_birth}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase">Gender</span>
                  <p className="font-semibold text-slate-900">{detail.customer.gender}</p>
                </div>
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase">Contact Information</span>
                <p className="text-slate-800 text-xs">
                  {detail.customer.email || '—'} • {detail.customer.phone_number || '—'}
                </p>
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase">Registered Address</span>
                <p className="text-slate-800 text-xs leading-relaxed">{detail.customer.address}</p>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-3 border-t border-slate-100 text-xs text-slate-400">
            Sourced directly from customer registration record.
          </div>
        </div>

        {/* Uploaded Document Preview */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-navy-900 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                Document Artifact ({detail.latest_attempt.document_type})
              </h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                Attempt #{detail.latest_attempt.attempt_number}
              </span>
            </div>

            <div className="mt-4">
              {detail.latest_attempt.document_url ? (
                <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-900 aspect-video flex items-center justify-center">
                  <img
                    src={detail.latest_attempt.document_url}
                    alt="Document Scan"
                    className="max-h-full max-w-full object-contain"
                  />
                  <a
                    href={detail.latest_attempt.document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute top-2 right-2 bg-navy-900/80 hover:bg-navy-900 text-white p-1.5 rounded-lg text-xs flex items-center gap-1 backdrop-blur-sm"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ) : (
                <div className="h-48 rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-400">
                  <FileText className="w-8 h-8 mb-1" />
                  <span className="text-xs">No direct preview URL available</span>
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400">
            Document loaded via short-lived backend presigned S3 GET URL.
          </div>
        </div>
      </div>

      {/* Field Comparison Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 bg-slate-50">
          <h2 className="text-sm font-bold text-navy-950 uppercase tracking-wider">
            OCR Extraction & Field-Level Comparison
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Side-by-side comparison between customer database values and OCR extracted tokens.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600 text-xs uppercase tracking-wider font-bold">
              <tr>
                <th className="py-3 px-6">Field Name</th>
                <th className="py-3 px-6">Customer Database Value</th>
                <th className="py-3 px-6">Extracted Document Value</th>
                <th className="py-3 px-6 text-center">Verification Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(detail.latest_attempt.field_comparisons || []).map((c) => (
                <tr
                  key={c.field}
                  className={`transition ${c.is_match ? 'bg-white' : 'bg-rose-50/70 font-semibold'}`}
                >
                  <td className="py-3.5 px-6 font-medium text-slate-900">
                    {formatFieldLabel(c.field)}
                  </td>
                  <td className="py-3.5 px-6 text-slate-800">{c.customer_value || '—'}</td>
                  <td className="py-3.5 px-6 text-slate-800">{c.document_value || '—'}</td>
                  <td className="py-3.5 px-6 text-center">
                    {c.is_match ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Match
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        Mismatch
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reviewer Decision Form */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-bold text-navy-950">Reviewer Determination</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Submit an official action for this attempt. This decision is auditable and updates the customer portal.
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Reviewer Notes / Justification
          </label>
          <textarea
            value={decisionNotes}
            onChange={(e) => setDecisionNotes(e.target.value)}
            rows={3}
            placeholder="e.g., DOB in OCR is 2006, whereas customer profile states 2007. Requesting clearer re-upload."
            className="w-full p-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-navy-800"
          />
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            disabled={submittingDecision}
            onClick={() => handleDecision('APPROVED')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            Approve Verification
          </button>

          <button
            type="button"
            disabled={submittingDecision}
            onClick={() => handleDecision('REJECTED')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" />
            Reject Case
          </button>

          <button
            type="button"
            disabled={submittingDecision}
            onClick={() => handleDecision('REUPLOAD_REQUESTED')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Request Re-upload
          </button>
        </div>
      </div>

      {/* Audit Trail List */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-navy-950 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-500" />
          Audit Trail Log
        </h2>

        <div className="space-y-3">
          {(detail.audit_trail || []).map((ev, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2"
            >
              <div>
                <span className="font-bold text-navy-900 mr-2 uppercase tracking-wide">
                  {ev.action}
                </span>
                <span className="text-slate-500">by {ev.actor}</span>
                {ev.details && (
                  <p className="text-slate-600 text-xs mt-1 font-mono">
                    {JSON.stringify(ev.details)}
                  </p>
                )}
              </div>
              <span className="text-slate-400 font-medium whitespace-nowrap">
                {formatDate(ev.created_at)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CaseDetailPage() {
  return (
    <Suspense fallback={<LoadingSpinner message="Loading case details..." />}>
      <CaseDetailContent />
    </Suspense>
  );
}
