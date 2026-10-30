import { describe, it, expect } from 'vitest';

// Document classification rules test
const PAN_REGEX = /[A-Z]{5}[0-9]{4}[A-Z]{1}/;
const AADHAAR_12_DIGIT_REGEX = /\b[2-9]{1}[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b/;

const AADHAAR_KEYWORDS = [
  'government of india',
  'bharat sarkar',
  'unique identification',
  'authority of india',
  'uidai',
  'aadhaar',
  'aadhar',
  'mera aadhaar',
  'meri pehchan',
];

const PAN_KEYWORDS = [
  'income tax department',
  'incometax',
  'govt. of india',
  'permanent account number',
];

function classifyText(text: string): 'AADHAAR' | 'PAN' | 'UNKNOWN' {
  const lower = text.toLowerCase();
  const hasPanNumber = PAN_REGEX.test(text);
  const hasPanKeywords = PAN_KEYWORDS.some((kw) => lower.includes(kw));

  const hasAadhaarNumber = AADHAAR_12_DIGIT_REGEX.test(text);
  const hasAadhaarKeywords = AADHAAR_KEYWORDS.some((kw) => lower.includes(kw));

  if ((hasPanNumber || hasPanKeywords) && !(hasAadhaarNumber || hasAadhaarKeywords)) {
    return 'PAN';
  } else if ((hasAadhaarNumber || hasAadhaarKeywords) && !(hasPanNumber || hasPanKeywords)) {
    return 'AADHAAR';
  } else if (hasPanNumber && !hasAadhaarNumber) {
    return 'PAN';
  } else if (hasAadhaarNumber && !hasPanNumber) {
    return 'AADHAAR';
  }
  return 'UNKNOWN';
}

describe('Document Classification Signature Engine', () => {
  it('should accurately identify PAN card text', () => {
    const panSample = `
      INCOME TAX DEPARTMENT
      GOVT. OF INDIA
      Permanent Account Number Card
      ABCDE1234F
      Name: ARMAAN SYED
      Father's Name: MOHAMMED SYED
    `;
    expect(classifyText(panSample)).toBe('PAN');
  });

  it('should accurately identify Aadhaar card text', () => {
    const aadhaarSample = `
      Government of India
      Unique Identification Authority of India
      Mera Aadhaar, Meri Pehchan
      To: Rahul Sharma
      DOB: 15/08/1995
      3812 4920 1849
    `;
    expect(classifyText(aadhaarSample)).toBe('AADHAAR');
  });

  it('should detect mismatch if PAN is uploaded to Aadhaar slot', () => {
    const panSample = `INCOME TAX DEPARTMENT ABCDE1234F`;
    const detected = classifyText(panSample);
    const expectedSlot = 'AADHAAR';
    expect(detected).not.toBe(expectedSlot);
  });

  it('should detect mismatch if Aadhaar is uploaded to PAN slot', () => {
    const aadhaarSample = `Government of India 9823 4810 2931 Mera Aadhaar`;
    const detected = classifyText(aadhaarSample);
    const expectedSlot = 'PAN';
    expect(detected).not.toBe(expectedSlot);
  });
});
