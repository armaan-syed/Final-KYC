'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, CheckCircle2, AlertTriangle, ArrowLeft, FileText, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';
import { apiGetUploadUrl, directUploadToS3, apiSubmitKYC, getApiErrorMessage } from '@/lib/api';
import { DocumentType } from '@/types';
import { ErrorAlert, SuccessAlert } from '@/components/ui/Alerts';

export default function DocumentUploadPage() {
  const router = useRouter();
  const [documentType, setDocumentType] = useState<DocumentType>('AADHAAR');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [stepStatus, setStepStatus] = useState<'idle' | 'requesting_url' | 'uploading_s3' | 'submitting' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type (JPEG, PNG, PDF per Person C specification)
    const validTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setError('Unsupported file type. Please upload a JPEG, PNG, or PDF document.');
      return;
    }

    // Size limit: 10MB
    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds the 10MB limit.');
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
      setError('Please select a document file to upload.');
      return;
    }

    setError(null);
    try {
      // Step 1: Request Presigned URL from Backend API
      setStepStatus('requesting_url');
      const { upload_url, s3_key } = await apiGetUploadUrl({
        document_type: documentType,
        file_name: selectedFile.name,
        content_type: selectedFile.type,
      });

      // Step 2: Direct browser PUT to S3
      setStepStatus('uploading_s3');
      await directUploadToS3(upload_url, selectedFile, (percent) => {
        setUploadProgress(percent);
      });

      // Step 3: Notify backend API that document is safely uploaded in S3
      setStepStatus('submitting');
      await apiSubmitKYC({
        s3_key,
        document_type: documentType,
        file_name: selectedFile.name,
        file_size_bytes: selectedFile.size,
      });

      setStepStatus('done');
      setTimeout(() => {
        router.push('/dashboard');
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
          href="/dashboard"
          className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-navy-900 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-navy-950">Upload Identity Document</h1>
          <p className="text-sm text-slate-500">
            Submit your Aadhaar or PAN card for automated OCR field verification.
          </p>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {stepStatus === 'done' && (
        <SuccessAlert message="Document submitted successfully! Processing initiated. Redirecting to dashboard..." />
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        {/* Document Type Selector */}
        <div>
          <label className="block text-xs font-bold text-navy-900 uppercase tracking-wider mb-3">
            1. Select Document Type
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label
              className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition ${
                documentType === 'AADHAAR'
                  ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600 text-navy-950 font-bold'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <input
                type="radio"
                name="docType"
                checked={documentType === 'AADHAAR'}
                onChange={() => setDocumentType('AADHAAR')}
                className="text-navy-900 focus:ring-navy-800"
              />
              <div>
                <p className="text-sm font-semibold">Aadhaar Card</p>
                <p className="text-xs text-slate-500 font-normal">Extracts Full Name, DOB, Gender, Address</p>
              </div>
            </label>

            <label
              className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition ${
                documentType === 'PAN'
                  ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600 text-navy-950 font-bold'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <input
                type="radio"
                name="docType"
                checked={documentType === 'PAN'}
                onChange={() => setDocumentType('PAN')}
                className="text-navy-900 focus:ring-navy-800"
              />
              <div>
                <p className="text-sm font-semibold">PAN Card</p>
                <p className="text-xs text-slate-500 font-normal">Extracts Full Name, DOB, PAN Identifier</p>
              </div>
            </label>
          </div>
        </div>

        {/* File Drag & Drop / Input */}
        <div>
          <label className="block text-xs font-bold text-navy-900 uppercase tracking-wider mb-3">
            2. Choose Document File (JPEG, PNG, or PDF)
          </label>
          <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:border-blue-500 transition relative bg-slate-50/50">
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              onChange={handleFileChange}
              disabled={stepStatus !== 'idle'}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <div className="flex flex-col items-center justify-center">
              <UploadCloud className="w-12 h-12 text-slate-400 mb-3" />
              <p className="text-sm font-semibold text-navy-950">
                Click to browse or drag and drop your document
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Accepted formats: JPEG, PNG, PDF (Up to 10MB)
              </p>
            </div>
          </div>
        </div>

        {/* Selected file preview */}
        {selectedFile && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-12 h-12 rounded object-cover border border-slate-300"
                />
              ) : (
                <FileText className="w-10 h-10 text-slate-500" />
              )}
              <div>
                <p className="text-sm font-medium text-slate-900">{selectedFile.name}</p>
                <p className="text-xs text-slate-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type}
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-blue-100 text-blue-800">
              Ready
            </span>
          </div>
        )}

        {/* Direct S3 Upload Progress Bar */}
        {stepStatus !== 'idle' && stepStatus !== 'done' && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-700">
              <span>
                {stepStatus === 'requesting_url' && 'Requesting authorized upload URL...'}
                {stepStatus === 'uploading_s3' && `Directly uploading to S3 (${uploadProgress}%)`}
                {stepStatus === 'submitting' && 'Enqueuing document for verification...'}
              </span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={!selectedFile || stepStatus !== 'idle'}
            className="w-full py-3.5 px-4 rounded-xl bg-navy-900 text-white font-semibold text-sm hover:bg-navy-800 transition shadow-sm disabled:opacity-50"
          >
            {stepStatus === 'idle' ? 'Upload and Begin Verification' : 'Processing Submission...'}
          </button>
        </div>
      </form>
    </div>
  );
}
