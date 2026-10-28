import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LoadingSpinner({
  className,
  message = 'Loading...',
}: {
  className?: string;
  message?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center p-8 text-slate-500', className)}>
      <Loader2 className="w-8 h-8 animate-spin text-navy-700 mb-2" />
      {message && <p className="text-sm font-medium">{message}</p>}
    </div>
  );
}

export function ErrorAlert({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-lg bg-rose-50 border border-rose-200 p-4 text-rose-800 flex items-start justify-between">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-rose-900">Error:</span>
        <span className="text-sm">{message}</span>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs bg-rose-100 hover:bg-rose-200 text-rose-900 px-2.5 py-1 rounded font-medium transition"
        >
          Try Again
        </button>
      )}
    </div>
  );
}

export function SuccessAlert({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-emerald-800 text-sm font-medium">
      {message}
    </div>
  );
}
