import React from 'react';
import { KYCStatus } from '@/types';
import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, AlertTriangle, XCircle, RotateCcw } from 'lucide-react';

interface KYCStatusBadgeProps {
  status: KYCStatus;
  className?: string;
}

const statusMap: Record<KYCStatus, { label: string; bg: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
  PENDING: {
    label: 'Pending',
    bg: 'bg-slate-100 border-slate-200',
    text: 'text-slate-700',
    icon: Clock,
  },
  PROCESSING: {
    label: 'Processing OCR',
    bg: 'bg-blue-50 border-blue-200 animate-pulse',
    text: 'text-blue-800',
    icon: Clock,
  },
  AUTO_VERIFIED: {
    label: 'Auto Verified',
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-800',
    icon: CheckCircle2,
  },
  REVIEW_REQUIRED: {
    label: 'Review Required',
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-800',
    icon: AlertTriangle,
  },
  APPROVED: {
    label: 'Approved',
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-800',
    icon: CheckCircle2,
  },
  REJECTED: {
    label: 'Rejected',
    bg: 'bg-rose-50 border-rose-200',
    text: 'text-rose-800',
    icon: XCircle,
  },
  REUPLOAD_PENDING: {
    label: 'Re-upload Needed',
    bg: 'bg-orange-50 border-orange-200',
    text: 'text-orange-800',
    icon: RotateCcw,
  },
  REUPLOAD_REQUESTED: {
    label: 'Re-upload Requested',
    bg: 'bg-orange-50 border-orange-200',
    text: 'text-orange-800',
    icon: RotateCcw,
  },
};

export const KYCStatusBadge: React.FC<KYCStatusBadgeProps> = ({ status, className }) => {
  const config = statusMap[status] || statusMap.PENDING;
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border tracking-wide uppercase',
        config.bg,
        config.text,
        className
      )}
    >
      <Icon className="w-3.5 h-3.5 stroke-[2.5]" />
      {config.label}
    </span>
  );
};
