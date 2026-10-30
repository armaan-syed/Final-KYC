import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  UploadCloud,
  CheckCircle2,
  ArrowLeft,
  FileText,
  ShieldCheck,
  AlertCircle,
  FileCheck,
  Lock,
  ScanLine,
} from 'lucide-react';
import { apiGetUploadUrl, directUploadToS3, apiSubmitKYC, getApiErrorMessage } from '@/lib/api';
import { DocumentType } from '@/types';
import { ErrorAlert, SuccessAlert } from '@/components/ui/Alerts';
import { classifyDocument } from '@/lib/documentClassifier';

export default function DocumentUploadPage() {
  const navigate = useNavigate();
  const [documentType, setDocumentType] = useState<DocumentType>('AADHAAR');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [stepStatus, setStepStatus] = useState<
    'idle' | 'scanning_document' | 'requesting_url' | 'uploading_s3' | 'submitting' | 'done'
  >('idle');
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setError('Unsupported format. Please select JPEG, PNG, or PDF.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds the 10MB maximum limit.');
      return;
    }

    setSelectedFile(file);

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please choose a document to proceed.');
      return;
    }

    setError(null);
    try {
      // Step 0: Pre-Upload Instant Classification (OCR Scan)
      setStepStatus('scanning_document');
      const classification = await classifyDocument(selectedFile, documentType);
      if (!classification.isMatch) {
        setError(
          classification.message ||
            `Mismatch detected: The uploaded file does not match the required ${documentType} format.`
        );
        setStepStatus('idle');
        return;
      }

      // Step 1: Request presigned S3 URL from FastAPI Backend
      setStepStatus('requesting_url');
      const { upload_url, s3_key } = await apiGetUploadUrl({
        document_type: documentType,
        file_name: selectedFile.name,
        content_type: selectedFile.type,
      });

      // Step 2: Direct Browser-to-S3 Upload (PUT)
      setStepStatus('uploading_s3');
      await directUploadToS3(upload_url, selectedFile, (percent) => {
        setUploadProgress(percent);
      });

      // Step 3: Trigger SQS verification workflow via /kyc/submit
      setStepStatus('submitting');
      await apiSubmitKYC({
        s3_key,
        document_type: documentType,
        file_name: selectedFile.name,
        file_size_bytes: selectedFile.size,
      });

      setStepStatus('done');
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } catch (err) {
      setError(getApiErrorMessage(err));
      setStepStatus('idle');
      setUploadProgress(0);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/dashboard"
          className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-sbi-blue hover:border-slate-300 transition shadow-sm"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Upload Identification Document
          </h1>
          <p className="text-xs text-slate-500">
            Directly upload to our secure AWS S3 bucket for automated OCR processing.
          </p>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {stepStatus === 'done' && (
        <SuccessAlert message="Document uploaded and enqueued successfully! Verification initiated. Redirecting to dashboard..." />
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-3xl p-8 sm:p-10 shadow-banking border border-slate-200/80 space-y-8"
      >
        {/* Step 1: Document Type */}
        <div>
          <label className="block text-xs font-bold text-sbi-blue uppercase tracking-wider mb-4">
            1. Select Document Type
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label
              className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                documentType === 'AADHAAR'
                  ? 'border-sbi-accent bg-blue-50/50 shadow-md ring-2 ring-sbi-accent/20'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="docType"
                  checked={documentType === 'AADHAAR'}
                  onChange={() => setDocumentType('AADHAAR')}
                  className="mt-1 text-sbi-accent focus:ring-sbi-accent"
                />
                <div>
                  <span className="font-bold text-sm text-slate-900 block">Aadhaar Card</span>
                  <span className="text-xs text-slate-500 mt-1 block leading-relaxed">
                    Compares Full Name, Date of Birth, and Gender.
                  </span>
                </div>
              </div>
            </label>

            <label
              className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                documentType === 'PAN'
                  ? 'border-sbi-accent bg-blue-50/50 shadow-md ring-2 ring-sbi-accent/20'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="docType"
                  checked={documentType === 'PAN'}
                  onChange={() => setDocumentType('PAN')}
                  className="mt-1 text-sbi-accent focus:ring-sbi-accent"
                />
                <div>
                  <span className="font-bold text-sm text-slate-900 block">PAN Card</span>
                  <span className="text-xs text-slate-500 mt-1 block leading-relaxed">
                    Compares Full Name and Date of Birth.
                  </span>
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Step 2: Dropzone */}
        <div>
          <label className="block text-xs font-bold text-sbi-blue uppercase tracking-wider mb-4">
            2. Choose Document File (JPEG, PNG, or PDF up to 10 MiB; PDFs up to 3 pages)
          </label>
          <div className="border-2 border-dashed border-slate-300 rounded-3xl p-10 text-center hover:border-sbi-accent transition-all relative bg-slate-50/60 hover:bg-blue-50/20 group">
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              onChange={handleFileChange}
              disabled={stepStatus !== 'idle'}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <div className="flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-white shadow-sm border border-slate-200 flex items-center justify-center text-sbi-accent mb-4 group-hover:scale-105 transition-transform">
                <UploadCloud className="w-8 h-8" />
              </div>
              <p className="text-sm font-bold text-slate-800">
                Click to browse or drag and drop your document
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Accepted: high resolution photos, camera scans, or digital PDFs
              </p>
            </div>
          </div>
        </div>

        {/* Selected File Details */}
        {selectedFile && (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-14 h-14 rounded-xl object-cover border border-slate-300"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-blue-100/70 text-sbi-accent flex items-center justify-center">
                  <FileText className="w-7 h-7" />
                </div>
              )}
              <div>
                <span className="font-bold text-sm text-slate-900 block">{selectedFile.name}</span>
                <span className="text-xs text-slate-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type}
                </span>
              </div>
            </div>

            <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-sbi-blue border border-blue-200">
              Format Supported
            </span>
          </div>
        )}

        {/* Progress Bar & Status */}
        {stepStatus !== 'idle' && stepStatus !== 'done' && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5">
                {stepStatus === 'scanning_document' && (
                  <>
                    <ScanLine className="w-3.5 h-3.5 text-sbi-accent animate-pulse" />
                    Scanning document type with local OCR engine...
                  </>
                )}
                {stepStatus === 'requesting_url' && 'Generating presigned S3 upload URL...'}
                {stepStatus === 'uploading_s3' && `Directly uploading to AWS S3 (${uploadProgress}%)`}
                {stepStatus === 'submitting' && 'Enqueuing to AWS SQS OCR pipeline...'}
              </span>
              <span>{stepStatus === 'scanning_document' ? 'Verifying' : `${uploadProgress}%`}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
              <div
                className={`bg-gradient-to-r from-sbi-blue to-sbi-accent h-3 rounded-full transition-all duration-300 ${
                  stepStatus === 'scanning_document' ? 'w-2/3 animate-pulse' : ''
                }`}
                style={stepStatus !== 'scanning_document' ? { width: `${uploadProgress}%` } : undefined}
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!selectedFile || stepStatus !== 'idle'}
          className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-sbi-blue to-sbi-accent text-white font-bold text-sm hover:from-sbi-navy hover:to-blue-600 transition shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {stepStatus === 'scanning_document' && (
            <>
              <ScanLine className="w-4 h-4 animate-spin" />
              <span>Checking Document Type...</span>
            </>
          )}
          {stepStatus === 'requesting_url' && <span>Preparing Direct Upload...</span>}
          {stepStatus === 'uploading_s3' && <span>Uploading to Bank Cloud ({uploadProgress}%)...</span>}
          {stepStatus === 'submitting' && <span>Enqueuing Verification...</span>}
          {stepStatus === 'done' && <span>Upload Complete!</span>}
          {stepStatus === 'idle' && (
            <>
              <ShieldCheck className="w-4 h-4" />
              <span>Verify & Upload Document</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
