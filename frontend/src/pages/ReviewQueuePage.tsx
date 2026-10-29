import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  RefreshCw,
  Search,
  ArrowRight,
  AlertTriangle,
  Filter,
  FileText,
  SlidersHorizontal,
} from 'lucide-react';
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
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Manual Review Queue
          </h1>
          <p className="text-xs text-slate-500">
            Cases flagged by automated OCR verification requiring determination by compliance officers.
          </p>
        </div>

        <button
          onClick={fetchQueue}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Queue
        </button>
      </div>

      {error && <ErrorAlert message={error} onRetry={fetchQueue} />}

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-banking flex flex-col sm:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer name or Case Reference..."
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-sbi-accent transition shadow-sm"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <SlidersHorizontal className="w-4 h-4 text-slate-500" />
          <select
            value={docFilter}
            onChange={(e) => setDocFilter(e.target.value as any)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-sbi-accent bg-white shadow-sm"
          >
            <option value="ALL">All Documents (Aadhaar & PAN)</option>
            <option value="AADHAAR">Aadhaar Only</option>
            <option value="PAN">PAN Only</option>
          </select>
        </div>
      </div>

      {/* Queue Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-banking overflow-hidden">
        {loading ? (
          <LoadingSpinner message="Fetching review queue records..." />
        ) : filteredCases.length === 0 ? (
          <div className="p-16 text-center text-slate-500">
            <p className="text-base font-bold text-slate-800">No pending exceptions found</p>
            <p className="text-xs text-slate-400 mt-1">
              All KYC cases have been resolved, verified, or auto-cleared.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/90 text-slate-500 uppercase tracking-wider text-[11px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-4 px-6">Case Reference</th>
                  <th className="py-4 px-6">Customer Name</th>
                  <th className="py-4 px-6">Doc Type</th>
                  <th className="py-4 px-6">Submission Date</th>
                  <th className="py-4 px-6">Flagged Discrepancy</th>
                  <th className="py-4 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredCases.map((item) => (
                  <tr key={item.kyc_case_id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="py-4 px-6 font-mono font-bold text-slate-800">
                      {item.kyc_case_id}
                    </td>
                    <td className="py-4 px-6">
                      <span className="font-bold text-slate-900 block text-xs">
                        {item.customer_name}
                      </span>
                      <span className="text-[11px] text-slate-400 font-normal">
                        Attempt #{item.attempt_number}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-bold text-[11px] border border-slate-200">
                        {item.document_type}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-slate-600">
                      {formatDate(item.submitted_at)}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-wrap gap-1.5">
                        {item.mismatched_fields.map((f) => (
                          <span
                            key={f}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                          >
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            {formatFieldLabel(f)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <Link
                        to={`/reviewer/cases/detail?caseId=${encodeURIComponent(item.kyc_case_id)}`}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sbi-blue hover:bg-sbi-accent text-white font-bold text-xs transition shadow-sm"
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
