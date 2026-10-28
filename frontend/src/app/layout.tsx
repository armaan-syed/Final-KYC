import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pramāṇa — Automated Banking KYC Verification',
  description: 'Automated, real-time banking KYC verification platform using AWS OCR and serverless architecture.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 antialiased">{children}</body>
    </html>
  );
}
