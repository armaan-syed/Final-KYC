import { createWorker } from 'tesseract.js';
import { DocumentType } from '@/types';

export interface DocumentClassificationResult {
  detectedType: 'AADHAAR' | 'PAN' | 'UNKNOWN';
  confidenceText: string;
  isMatch: boolean;
  message?: string;
}

const PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/;
const AADHAAR_12_DIGIT_REGEX = /\b[2-9][0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b/;

const AADHAAR_KEYWORDS = [
  'unique identification authority of india',
  'unique identification',
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
  'permanent account number',
];

/** Classify OCR text deterministically; ambiguous or unrelated text is rejected. */
export function classifyDocumentText(
  text: string,
  expectedType: DocumentType
): DocumentClassificationResult {
  const normalizedText = text.toUpperCase().replace(/\s+/g, ' ').trim();
  const hasPanEvidence =
    PAN_REGEX.test(normalizedText) || PAN_KEYWORDS.some((keyword) => normalizedText.includes(keyword.toUpperCase()));
  const hasAadhaarEvidence =
    AADHAAR_12_DIGIT_REGEX.test(normalizedText) ||
    AADHAAR_KEYWORDS.some((keyword) => normalizedText.includes(keyword.toUpperCase()));

  const detectedType =
    hasPanEvidence === hasAadhaarEvidence
      ? 'UNKNOWN'
      : hasPanEvidence
        ? 'PAN'
        : 'AADHAAR';

  if (detectedType === 'UNKNOWN') {
    const message = hasPanEvidence
      ? 'The image contains conflicting PAN and Aadhaar indicators. Upload a clear image of one document at a time.'
      : `Could not recognize this image as a ${expectedType === 'PAN' ? 'PAN' : 'Aadhaar'} card. Please upload a clear image of the selected document.`;
    return {
      detectedType,
      confidenceText: 'Unrecognized or ambiguous document',
      isMatch: false,
      message,
    };
  }

  if (detectedType !== expectedType) {
    const detectedName = detectedType === 'PAN' ? 'PAN' : 'Aadhaar';
    const expectedName = expectedType === 'PAN' ? 'PAN' : 'Aadhaar';
    return {
      detectedType,
      confidenceText: `Detected ${detectedName} indicators`,
      isMatch: false,
      message: `This image appears to be a ${detectedName} card, but the selected upload slot is ${expectedName}.`,
    };
  }

  return {
    detectedType,
    confidenceText: `Detected ${detectedType} indicators`,
    isMatch: true,
  };
}

let workerPromise: ReturnType<typeof createWorker> | null = null;

function getOCRWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng').catch((error: unknown) => {
      // Let a later upload retry worker initialization after a transient failure.
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

/**
 * Run a best-effort local OCR check before upload. The backend remains the
 * authoritative verifier; PDFs are passed through to its existing OCR path.
 */
export async function classifyDocument(
  file: File,
  expectedType: DocumentType
): Promise<DocumentClassificationResult> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return {
      detectedType: expectedType,
      confidenceText: 'PDF classification is deferred to server-side OCR',
      isMatch: true,
    };
  }

  try {
    const worker = await getOCRWorker();
    const result = await worker.recognize(file);
    return classifyDocumentText(result.data?.text || '', expectedType);
  } catch (error) {
    console.warn('Client-side OCR classification failed; server OCR remains authoritative.', error);
    // Keep legitimate uploads available when a browser cannot initialize local OCR.
    return {
      detectedType: 'UNKNOWN',
      confidenceText: 'Classification skipped; server-side OCR will verify the document',
      isMatch: true,
    };
  }
}
