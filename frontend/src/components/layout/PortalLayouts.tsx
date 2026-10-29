import React, { useEffect, useState } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { LoadingSpinner } from '@/components/ui/Alerts';
import { getCurrentUserRole } from '@/lib/auth';

export function CustomerLayout() {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkAuth() {
      const token = typeof window !== 'undefined' ? localStorage.getItem('pramana_access_token') : null;
      const role = await getCurrentUserRole();

      if (!token) {
        navigate('/login', { replace: true });
        return;
      }

      if (role === 'reviewer') {
        navigate('/reviewer/dashboard', { replace: true });
        return;
      }

      setAuthorized(true);
    }
    checkAuth();
  }, [navigate]);

  if (authorized === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <LoadingSpinner message="Validating institutional customer credentials..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between">
      <div>
        <Navbar portalType="customer" />
        <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Outlet />
        </main>
      </div>

      <footer className="bg-slate-900 text-slate-400 text-[11px] py-4 text-center border-t border-slate-800">
        Pramāṇa Institutional Banking Platform • Automated KYC Verification
      </footer>
    </div>
  );
}

export function ReviewerLayout() {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkAuth() {
      const token = typeof window !== 'undefined' ? localStorage.getItem('pramana_access_token') : null;
      const role = await getCurrentUserRole();

      if (!token) {
        navigate('/login', { replace: true });
        return;
      }

      if (role !== 'reviewer') {
        navigate('/dashboard', { replace: true });
        return;
      }

      setAuthorized(true);
    }
    checkAuth();
  }, [navigate]);

  if (authorized === null) {
    return (
      <div className="min-h-screen bg-sbi-dark flex items-center justify-center">
        <LoadingSpinner className="text-slate-200" message="Validating compliance desk credentials..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between">
      <div>
        <Navbar portalType="reviewer" />
        <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Outlet />
        </main>
      </div>

      <footer className="bg-sbi-dark text-slate-400 text-[11px] py-4 text-center border-t border-slate-800">
        Pramāṇa Compliance Desk • Central Auditing Console
      </footer>
    </div>
  );
}
