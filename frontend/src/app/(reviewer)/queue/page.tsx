'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Search, ArrowRight, AlertTriangle, Filter } from 'lucide-react';
import { apiGetReviewQueue, getApiErrorMessage } from '@/lib/api';
import { ReviewQueueItem } from '@/types';
import { LoadingSpinner, ErrorAlert } from '@/components/ui/Alerts';
import { formatDate, formatFieldLabel } from '@/lib/utils';

export default function ReviewQueuePage() {
  const [cases, setCases] = useState<ReviewQueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [docFilter, setDocFilter] = useState<'ALL' | 'AADHAAR' | 'PAN'>('ALL');

  const fetchQueue = async () => {
    try {
      setError(null);
      const res = await apiGetReviewQueue();
      setCases(res.cases);
      setTotal(res.total);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const filteredCases = cases.filter((c) => {
    const matchesSearch =
      c.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.kyc_case_id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDoc = docFilter === 'ALL' || c.document_type === docFilter;
    return matchesSearch && matchesDoc;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-950">Review Queue</h1>
          <p className="text-sm text-slate-500">
            Cases flagged for manual review with detected discrepancies.
          </p>
        </div>

        <button
          onClick={fetchQueue}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Queue
        </button>
      </div>

      {error && <ErrorAlert message={error} onRetry={fetchQueue} />}

      {/* Filter and Search controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer name or Case ID..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-navy-800"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={docFilter}
            onChange={(e) => setDocFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-navy-800 bg-white"
          >
            <option value="ALL">All Documents</option>
            <option value="AADHAAR">Aadhaar Only</option>
            <option value="PAN">PAN Only</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <LoadingSpinner message="Fetching queue items..." />
        ) : filteredCases.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <p className="text-base font-semibold">No pending cases match your criteria</p>
            <p className="text-xs mt-1">All exceptions have either been resolved or cleared.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase text-xs tracking-wider border-b border-slate-200 font-bold">
                <tr>
                  <th className="py-4 px-6">Case ID</th>
                  <th className="py-4 px-6">Customer Name</th>
                  <th className="py-4 px-6">Doc Type</th>
                  <th className="py-4 px-6">Submitted At</th>
                  <th className="py-4 px-6">Flagged Mismatch</th>
                  <th className="py-4 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCases.map((item) => (
                  <tr key={item.kyc_case_id} className="hover:bg-slate-50/80 transition">
                    <td className="py-4 px-6 font-mono text-xs font-semibold text-slate-700">
                      {item.kyc_case_id}
                    </td>
                    <td className="py-4 px-6 font-semibold text-navy-950">
                      {item.customer_name}
                      <span className="text-xs font-normal text-slate-400 block">
                        Attempt #{item.attempt_number}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-800 text-xs font-bold">
                        {item.document_type}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-slate-600 text-xs">
                      {formatDate(item.submitted_at)}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-wrap gap-1.5">
                        {item.mismatched_fields.map((f) => (
                          <span
                            key={f}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200"
                          >
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            {formatFieldLabel(f)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      {/* Query-based route compatible with Next.js static export */}
                      <Link
                        href={`/reviewer/cases/detail/?caseId=${encodeURIComponent(item.kyc_case_id)}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold transition"
                      >
                        <span>Review</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
