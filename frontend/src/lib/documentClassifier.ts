import { createWorker } from 'tesseract.js';
import { DocumentType } from '@/types';

export interface DocumentClassificationResult {
  detectedType: 'AADHAAR' | 'PAN' | 'UNKNOWN';
  confidenceText: string;
  isMatch: boolean;
  message?: string;
}

// Regex signatures
const PAN_REGEX = /[A-Z]{5}[0-9]{4}[A-Z]{1}/;
const AADHAAR_12_DIGIT_REGEX = /\b[2-9]{1}[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b/;

// Keyword signatures
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
  'enrollment no',
  'help@uidai',
];

const PAN_KEYWORDS = [
  'income tax department',
  'incometax',
  'govt. of india',
  'permanent account number',
  'father\'s name',
  'fathers name',
  'signature',
];

let workerPromise: Promise<any> | null = null;

async function getOCRWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng');
      return worker;
    })();
  }
  return workerPromise;
}

/**
 * Perform client-side OCR scan to determine if an uploaded image
 * matches the designated slot (AADHAAR vs PAN).
 */
export async function classifyDocument(
  file: File,
  expectedType: DocumentType
): Promise<DocumentClassificationResult> {
  // If it's a PDF, client-side tesseract canvas image extraction is non-trivial;
  // pass through to let backend OCR handle it without blocking the user.
  if (file.type === 'application/pdf') {
    return {
      detectedType: expectedType,
      confidenceText: 'PDF document - deferring full extraction to verification service',
      isMatch: true,
    };
  }

  try {
    const worker = await getOCRWorker();
    const ret = await worker.recognize(file);
    const rawText = (ret.data?.text || '').toLowerCase();

    // Check PAN signatures
    const hasPanNumber = PAN_REGEX.test(ret.data?.text || '');
    const hasPanKeywords = PAN_KEYWORDS.some((kw) => rawText.includes(kw));

    // Check Aadhaar signatures
    const hasAadhaarNumber = AADHAAR_12_DIGIT_REGEX.test(ret.data?.text || '');
    const hasAadhaarKeywords = AADHAAR_KEYWORDS.some((kw) => rawText.includes(kw));

    let detected: 'AADHAAR' | 'PAN' | 'UNKNOWN' = 'UNKNOWN';

    if ((hasPanNumber || hasPanKeywords) && !(hasAadhaarNumber || hasAadhaarKeywords)) {
      detected = 'PAN';
    } else if ((hasAadhaarNumber || hasAadhaarKeywords) && !(hasPanNumber || hasPanKeywords)) {
      detected = 'AADHAAR';
    } else if (hasPanNumber && !hasAadhaarNumber) {
      detected = 'PAN';
    } else if (hasAadhaarNumber && !hasPanNumber) {
      detected = 'AADHAAR';
    }

    // Evaluate matching
    if (detected === 'UNKNOWN') {
      const expectedName = expectedType === 'PAN' ? 'PAN Card' : 'Aadhaar Card';
      return {
        detectedType: 'UNKNOWN',
        confidenceText: 'Unrecognized document',
        isMatch: false,
        message: `Invalid Document! The uploaded image does not contain recognizable ${expectedName} details or text. Please ensure you upload a clear photo of your official ${expectedName}.`,
      };
    }

    if (detected !== expectedType) {
      const detectedName = detected === 'PAN' ? 'PAN Card' : 'Aadhaar Card';
      const expectedName = expectedType === 'PAN' ? 'PAN Card' : 'Aadhaar Card';

      return {
        detectedType: detected,
        confidenceText: `Detected ${detectedName} features`,
        isMatch: false,
        message: `Document Mismatch Detected! You selected the ${expectedName} slot, but the uploaded image appears to be a ${detectedName}. Please upload the correct document or switch the document type.`,
      };
    }

    return {
      detectedType: detected,
      confidenceText: `Verified ${detected}`,
      isMatch: true,
    };
  } catch (err) {
    console.warn('Client-side OCR classification error:', err);
    // Graceful fallback: do not block upload if client worker encounters browser error
    return {
      detectedType: expectedType,
      confidenceText: 'Classification skipped',
      isMatch: true,
    };
  }
}
