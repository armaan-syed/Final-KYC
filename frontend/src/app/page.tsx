'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Default entrypoint redirects to login page
    router.replace('/login');
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center text-slate-500 text-sm">
        Redirecting to Pramāṇa KYC portal...
      </div>
    </div>
  );
}
