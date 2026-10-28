import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString?: string | null): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return dateString;
  }
}

export function formatFieldLabel(field: string): string {
  const map: Record<string, string> = {
    name: 'Full Name',
    date_of_birth: 'Date of Birth',
    dob: 'Date of Birth',
    gender: 'Gender',
    address: 'Address',
    pan_number: 'PAN Number',
    aadhaar_number: 'Aadhaar Number',
  };
  return map[field.toLowerCase()] || field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
