import { describe, expect, it } from 'vitest';
import { classifyDocument, classifyDocumentText } from '@/lib/documentClassifier';

describe('client-side PAN/Aadhaar document classification', () => {
  it('recognizes PAN indicators from OCR text', () => {
    const result = classifyDocumentText(
      'INCOME TAX DEPARTMENT - PERMANENT ACCOUNT NUMBER - ABCDET111F',
      'PAN'
    );

    expect(result.detectedType).toBe('PAN');
    expect(result.isMatch).toBe(true);
  });

  it('recognizes Aadhaar indicators from OCR text', () => {
    const result = classifyDocumentText(
      'Unique Identification Authority of India - Aadhaar - 9999 9999 9999',
      'AADHAAR'
    );

    expect(result.detectedType).toBe('AADHAAR');
    expect(result.isMatch).toBe(true);
  });

  it('rejects PAN uploaded in the Aadhaar slot', () => {
    const result = classifyDocumentText('INCOME TAX DEPARTMENT ABCDE1234F', 'AADHAAR');

    expect(result.detectedType).toBe('PAN');
    expect(result.isMatch).toBe(false);
    expect(result.message).toContain('selected upload slot is Aadhaar');
  });

  it('rejects Aadhaar uploaded in the PAN slot', () => {
    const result = classifyDocumentText('UIDAI Aadhaar 3812 4920 1849', 'PAN');

    expect(result.detectedType).toBe('AADHAAR');
    expect(result.isMatch).toBe(false);
    expect(result.message).toContain('selected upload slot is PAN');
  });

  it('rejects unrelated text and generic government wording', () => {
    expect(classifyDocumentText('Government of India', 'AADHAAR').isMatch).toBe(false);
    expect(classifyDocumentText('Restaurant invoice total 500', 'PAN').isMatch).toBe(false);
  });

  it('rejects conflicting PAN and Aadhaar indicators as ambiguous', () => {
    const result = classifyDocumentText(
      'INCOME TAX DEPARTMENT ABCDE1234F UIDAI Aadhaar 3812 4920 1849',
      'PAN'
    );

    expect(result.detectedType).toBe('UNKNOWN');
    expect(result.isMatch).toBe(false);
    expect(result.message).toContain('conflicting');
  });

  it('preserves PDF uploads for the server-side OCR path', async () => {
    const pdf = new File(['synthetic PDF placeholder'], 'document.pdf', {
      type: 'application/pdf',
    });
    const result = await classifyDocument(pdf, 'PAN');

    expect(result.isMatch).toBe(true);
    expect(result.confidenceText).toContain('deferred to server-side OCR');
  });
});
