import { describe, it, expect } from 'vitest';
import { formatDate, formatFieldLabel, getFieldComparisonStatus } from '../lib/utils';

describe('Frontend Utils', () => {
  it('formats date to readable format', () => {
    const formatted = formatDate('2026-10-28T10:30:00Z');
    expect(formatted).toBeDefined();
    expect(formatted).toContain('2026');
  });

  it('formats field label keys to friendly display text', () => {
    expect(formatFieldLabel('date_of_birth')).toBe('Date of Birth');
    expect(formatFieldLabel('dob')).toBe('Date of Birth');
    expect(formatFieldLabel('name')).toBe('Full Name');
    expect(formatFieldLabel('gender')).toBe('Gender');
    expect(formatFieldLabel('pan_number')).toBe('PAN Number');
  });

  it('distinguishes missing OCR from an actual mismatch', () => {
    expect(getFieldComparisonStatus({
      field: 'date_of_birth', customer_value: '2007-02-15', document_value: undefined, is_match: false,
    })).toBe('NOT_EXTRACTED');
    expect(getFieldComparisonStatus({
      field: 'date_of_birth', customer_value: '2007-02-15', document_value: '2006-11-20', is_match: false,
    })).toBe('MISMATCH');
    expect(getFieldComparisonStatus({
      field: 'gender', customer_value: 'MALE', document_value: undefined, is_match: false, status: 'NOT_APPLICABLE',
    })).toBe('NOT_APPLICABLE');
  });
});
