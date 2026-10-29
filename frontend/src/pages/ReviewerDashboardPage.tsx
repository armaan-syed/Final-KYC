import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  Building2,
  ShieldAlert,
  BarChart3,
} from 'lucide-react';
import { apiGetReviewerDashboard, getApiErrorMessage } from '@/lib/api';
import { DashboardSummary } from '@/types';
import { LoadingSpinner, ErrorAlert } from '@/components/ui/Alerts';

export default function ReviewerDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    try {
      setError(null);
      const data = await apiGetReviewerDashboard();
      setSummary(data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    // 60-second polling interval required by specification
    const interval = setInterval(fetchDashboard, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <LoadingSpinner message="Querying institutional reviewer metrics..." />;
  }

  return (
    <div className="space-y-8">
      {/* Reviewer Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-sbi-blue text-xs font-bold mb-2">
            <Building2 className="w-3.5 h-3.5 text-sbi-accent" />
            Central Compliance & Audit Desk
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Reviewer Operations Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time throughput metrics for automated OCR verification & manual exceptions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchDashboard}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Metrics
          </button>

          <Link
            to="/reviewer/queue"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-sbi-blue to-sbi-accent hover:from-sbi-navy hover:to-blue-600 text-white text-xs font-bold transition shadow-lg shadow-blue-900/20"
          >
            <span>Open Review Queue</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {error && <ErrorAlert message={error} onRetry={fetchDashboard} />}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Pending Review */}
        <div className="bg-white p-6 sm:p-7 rounded-3xl border border-amber-200 shadow-banking hover:shadow-banking-hover transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
              Pending Manual Review
            </span>
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-slate-900">
              {summary?.pending_review ?? 0}
            </span>
            <span className="text-xs font-bold text-amber-600">Exceptions</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Flagged for field discrepancies</p>
        </div>

        {/* Auto Verified Today */}
        <div className="bg-white p-6 sm:p-7 rounded-3xl border border-emerald-200 shadow-banking hover:shadow-banking-hover transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              Auto Verified Today
            </span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-slate-900">
              {summary?.auto_verified_today ?? 0}
            </span>
            <span className="text-xs font-bold text-emerald-600">100% OCR Match</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Zero human touch approvals</p>
        </div>

        {/* Approved by Reviewer */}
        <div className="bg-white p-6 sm:p-7 rounded-3xl border border-blue-200 shadow-banking hover:shadow-banking-hover transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sbi-accent">
              Reviewer Approved
            </span>
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-sbi-accent flex items-center justify-center border border-blue-200">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-slate-900">
              {summary?.approved_today ?? 0}
            </span>
            <span className="text-xs font-bold text-sbi-accent">Human Cleared</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Approved upon manual override</p>
        </div>

        {/* Rejected Today */}
        <div className="bg-white p-6 sm:p-7 rounded-3xl border border-rose-200 shadow-banking hover:shadow-banking-hover transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
              Rejected Today
            </span>
            <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200">
              <XCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-slate-900">
              {summary?.rejected_today ?? 0}
            </span>
            <span className="text-xs font-bold text-rose-600">Disallowed</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Fraud or unresolvable data</p>
        </div>
      </div>

      {/* Action Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-sbi-dark via-sbi-navy to-sbi-blue p-8 sm:p-10 text-white shadow-banking border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Exception Queue Awaiting Determination
          </h2>
          <p className="text-slate-300 text-xs mt-2 max-w-xl leading-relaxed">
            Whenever a customer's document exhibits an OCR mismatch with the bank database (e.g. spelling or DOB discrepancy), it lands in the review queue. Inspect side-by-side scans and take compliance action.
          </p>
        </div>

        <Link
          to="/reviewer/queue"
          className="inline-flex items-center gap-2 px-6 py-4 rounded-2xl bg-sbi-accent hover:bg-blue-600 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-blue-900/40 hover:scale-[1.02]"
        >
          <span>Open Review Queue</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
