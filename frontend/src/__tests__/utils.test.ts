import { describe, it, expect } from 'vitest';
import { formatDate, formatFieldLabel } from '../src/lib/utils';

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
});
