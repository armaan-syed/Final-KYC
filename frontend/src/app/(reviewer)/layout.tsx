'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingSpinner } from '@/components/ui/Alerts';
import { getCurrentUserRole } from '@/lib/auth';

export default function ReviewerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkAuth() {
      const token = typeof window !== 'undefined' ? localStorage.getItem('pramana_access_token') : null;
      const role = await getCurrentUserRole();

      if (!token) {
        router.replace('/login');
        return;
      }

      if (role !== 'reviewer') {
        router.replace('/dashboard');
        return;
      }

      setAuthorized(true);
    }
    checkAuth();
  }, [router]);

  if (authorized === null) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <LoadingSpinner className="text-slate-300" message="Verifying reviewer privileges..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Navbar portalType="reviewer" />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
