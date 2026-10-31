import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  RotateCcw,
  User,
  FileText,
  Clock,
  ExternalLink,
  ShieldAlert,
  Building2,
  Scale,
} from 'lucide-react';
import { apiGetCaseDetail, apiSubmitDecision, getApiErrorMessage } from '@/lib/api';
import { CaseDetail, DecisionType } from '@/types';
import { KYCStatusBadge } from '@/components/ui/KYCStatusBadge';
import { LoadingSpinner, ErrorAlert, SuccessAlert } from '@/components/ui/Alerts';
import { formatDate, formatFieldLabel } from '@/lib/utils';

export default function CaseDetailPage() {
  const [searchParams] = useSearchParams();
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
      setDecisionFeedback(`Compliance decision [${res.decision}] recorded successfully.`);
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
    return <LoadingSpinner message="Loading full case dossier and OCR comparison records..." />;
  }

  if (!detail) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500">Case dossier could not be located.</p>
        <Link to="/reviewer/queue" className="text-xs font-bold text-sbi-accent underline mt-2 inline-block">
          Return to Review Queue
        </Link>
      </div>
    );
  }

  const caseStatus = detail.status ?? (
    detail.latest_attempt.status === 'REUPLOAD_REQUESTED'
      ? 'REUPLOAD_PENDING'
      : detail.latest_attempt.status
  );

  return (
    <div className="space-y-8">
      {/* Top Dossier Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/reviewer/queue"
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-sbi-blue hover:border-slate-300 transition shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-lg text-slate-900">
                Case: {detail.kyc_case_id}
              </span>
              <KYCStatusBadge status={caseStatus} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Applicant: <strong className="text-slate-800">{detail.customer.full_name}</strong>
            </p>
          </div>
        </div>
      </div>

      {error && <ErrorAlert message={error} onRetry={fetchDetail} />}
      {decisionFeedback && <SuccessAlert message={decisionFeedback} />}

      {/* Grid: Bank Profile vs Document Scan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Core Bank Record */}
        <div className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-banking flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100 mb-5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-sbi-accent flex items-center justify-center border border-blue-200">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Core Banking Database Profile</h3>
                <p className="text-[11px] text-slate-500">Record provided during customer registration</p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <span className="text-slate-400 font-semibold block uppercase text-[10px]">
                  Registered Full Name
                </span>
                <span className="font-bold text-slate-900 text-sm mt-0.5 block">
                  {detail.customer.full_name}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[10px]">
                    Date of Birth
                  </span>
                  <span className="font-bold text-slate-800 text-sm mt-0.5 block">
                    {detail.customer.date_of_birth}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[10px]">
                    Gender
                  </span>
                  <span className="font-bold text-slate-800 text-sm mt-0.5 block">
                    {detail.customer.gender}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold block uppercase text-[10px]">
                  Contact Information
                </span>
                <span className="text-slate-700 font-medium mt-0.5 block">
                  {detail.customer.email || '—'} • {detail.customer.phone_number || '—'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-semibold block uppercase text-[10px]">
                  Residential Address
                </span>
                <span className="text-slate-700 font-medium leading-relaxed mt-0.5 block">
                  {detail.customer.address}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-slate-100 text-[11px] text-slate-400">
            Source: Customer PostgreSQL table via /reviewer/cases/{detail.kyc_case_id}
          </div>
        </div>

        {/* Uploaded Document Artifact */}
        <div className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-banking flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Uploaded Document Artifact ({detail.latest_attempt.document_type})
                  </h3>
                  <p className="text-[11px] text-slate-500">Attempt #{detail.latest_attempt.attempt_number}</p>
                </div>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-sbi-blue border border-blue-200">
                S3 Presigned GET
              </span>
            </div>

            <div className="mt-2">
              {detail.latest_attempt.document_url ? (
                <div className="relative rounded-2xl border border-slate-200 overflow-hidden bg-slate-950 aspect-video flex items-center justify-center group shadow-inner">
                  <img
                    src={detail.latest_attempt.document_url}
                    alt="Document Scan"
                    className="max-h-full max-w-full object-contain"
                  />
                  <a
                    href={detail.latest_attempt.document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute top-3 right-3 bg-sbi-dark/90 hover:bg-sbi-dark text-white p-2 rounded-xl text-xs flex items-center gap-1.5 backdrop-blur-md shadow-md border border-slate-700 transition"
                  >
                    <span>Full Scan</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ) : (
                <div className="h-48 rounded-2xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-400">
                  <FileText className="w-8 h-8 mb-1" />
                  <span className="text-xs">No direct document URL available</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-slate-100 text-[11px] text-slate-400">
            Document loaded through temporary time-restricted presigned URL.
          </div>
        </div>
      </div>

      {/* Side-by-side Field Comparison Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-banking overflow-hidden">
        <div className="p-6 bg-slate-50/80 border-b border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 text-sbi-blue flex items-center justify-center">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Side-by-Side OCR Field Comparison & Discrepancy Matrix
            </h3>
            <p className="text-xs text-slate-500">
              Comparing database customer registration with raw tokens extracted by AWS Tesseract / OpenCV
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/80 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-6">Evaluation Field</th>
                <th className="py-3.5 px-6">Customer Database Value</th>
                <th className="py-3.5 px-6">Extracted Document Value (OCR)</th>
                <th className="py-3.5 px-6 text-center">Match State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {(detail.latest_attempt.field_comparisons || []).map((c) => (
                <tr
                  key={c.field}
                  className={`transition-colors ${c.is_match ? 'bg-white' : 'bg-rose-50/70 font-bold'}`}
                >
                  <td className="py-4 px-6 text-slate-900 font-bold">
                    {formatFieldLabel(c.field)}
                  </td>
                  <td className="py-4 px-6 text-slate-700">{c.customer_value || '—'}</td>
                  <td className="py-4 px-6 text-slate-700">{c.document_value || '—'}</td>
                  <td className="py-4 px-6 text-center">
                    {c.is_match ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Exact Match
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        Discrepancy
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reviewer Determination Form */}
      <div className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-banking space-y-5">
        <div>
          <h3 className="text-base font-bold text-slate-900">Compliance Determination & Action</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Submit an official action on this case. This decision writes to the audit log and notifies the customer.
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Determination Notes / Officer Justification
          </label>
          <textarea
            value={decisionNotes}
            onChange={(e) => setDecisionNotes(e.target.value)}
            rows={3}
            placeholder="e.g. Verified date of birth discrepancy is due to typographical error on physical PAN card. Re-upload requested."
            className="w-full p-4 rounded-2xl border border-slate-300 text-xs focus:ring-2 focus:ring-sbi-accent focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button
            type="button"
            disabled={submittingDecision}
            onClick={() => handleDecision('APPROVED')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-md shadow-emerald-900/20 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            Approve Verification
          </button>

          <button
            type="button"
            disabled={submittingDecision}
            onClick={() => handleDecision('REJECTED')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-md shadow-rose-900/20 disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" />
            Reject Case
          </button>

          <button
            type="button"
            disabled={submittingDecision}
            onClick={() => handleDecision('REUPLOAD_REQUESTED')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-md shadow-amber-900/20 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Request Re-upload
          </button>
        </div>
      </div>

      {/* Append-only Audit Trail */}
      <div className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-banking space-y-4">
        <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
          <Clock className="w-4 h-4 text-slate-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
            Append-Only Institutional Audit Log
          </h3>
        </div>

        <div className="space-y-3">
          {(detail.audit_trail || []).map((ev, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2"
            >
              <div>
                <span className="font-bold text-slate-900 mr-2 uppercase tracking-wide">
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
