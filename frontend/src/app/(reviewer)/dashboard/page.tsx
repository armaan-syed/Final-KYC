'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, CheckCircle2, XCircle, AlertCircle, Clock, ArrowRight, RefreshCw } from 'lucide-react';
import { apiGetReviewerDashboard, getApiErrorMessage } from '@/lib/api';
import { DashboardSummary } from '@/types';
import { LoadingSpinner, ErrorAlert } from '@/components/ui/Alerts';

export default function ReviewerDashboard() {
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
    // 60-second polling interval specified in Person C requirements
    const interval = setInterval(fetchDashboard, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <LoadingSpinner message="Loading reviewer statistics..." />;
  }

  return (
    <div className="space-y-8">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-950">Reviewer Operations Dashboard</h1>
          <p className="text-sm text-slate-500">
            Real-time verification metrics and manual exception review queue.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchDashboard}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>

          <Link
            href="/reviewer/queue"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-navy-900 text-white text-xs font-semibold hover:bg-navy-800 transition shadow-sm"
          >
            <span>Review Queue</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {error && <ErrorAlert message={error} onRetry={fetchDashboard} />}

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Pending Reviews */}
        <div className="bg-white p-6 rounded-2xl border border-amber-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
              Pending Manual Review
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-navy-950">
              {summary?.pending_review ?? 0}
            </span>
            <span className="text-xs text-amber-700 font-semibold">Action Required</span>
          </div>
        </div>

        {/* Auto Verified Today */}
        <div className="bg-white p-6 rounded-2xl border border-emerald-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Auto Verified Today
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-navy-950">
              {summary?.auto_verified_today ?? 0}
            </span>
            <span className="text-xs text-emerald-700 font-semibold">100% OCR Match</span>
          </div>
        </div>

        {/* Approved Today */}
        <div className="bg-white p-6 rounded-2xl border border-blue-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
              Approved by Reviewers
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-navy-950">
              {summary?.approved_today ?? 0}
            </span>
            <span className="text-xs text-blue-700 font-semibold">Human Verified</span>
          </div>
        </div>

        {/* Rejected Today */}
        <div className="bg-white p-6 rounded-2xl border border-rose-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
              Rejected Today
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-navy-950">
              {summary?.rejected_today ?? 0}
            </span>
            <span className="text-xs text-rose-700 font-semibold">Non-compliant</span>
          </div>
        </div>
      </div>

      {/* Action Banner to Review Queue */}
      <div className="bg-navy-900 rounded-2xl p-8 text-white flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h2 className="text-xl font-bold">Ready to inspect flagged KYC cases?</h2>
          <p className="text-slate-300 text-sm mt-1 max-w-xl">
            Cases flagged by the automated OCR pipeline due to field mismatches or low confidence are waiting for manual determination.
          </p>
        </div>
        <Link
          href="/reviewer/queue"
          className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-sm transition shadow-lg shadow-blue-900/40"
        >
          <span>Open Review Queue</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
