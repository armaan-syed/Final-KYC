'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldCheck, LogOut, User, FileText, CheckCircle, LayoutDashboard, ListOrdered } from 'lucide-react';
import { logoutUser } from '@/lib/auth';

export function Navbar({ portalType }: { portalType: 'customer' | 'reviewer' }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await logoutUser();
    router.push('/login');
  };

  const customerNav = [
    { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Upload Document', href: '/kyc/upload', icon: FileText },
    { label: 'KYC Status & History', href: '/kyc/status', icon: CheckCircle },
  ];

  const reviewerNav = [
    { label: 'Dashboard', href: '/reviewer/dashboard', icon: LayoutDashboard },
    { label: 'Review Queue', href: '/reviewer/queue', icon: ListOrdered },
  ];

  const navItems = portalType === 'customer' ? customerNav : reviewerNav;

  return (
    <header className="bg-navy-900 border-b border-navy-800 text-white sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href={portalType === 'customer' ? '/dashboard' : '/reviewer/dashboard'} className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <span className="font-bold text-lg tracking-tight">Pramāṇa</span>
              <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-navy-800 text-blue-200 border border-navy-700">
                {portalType === 'customer' ? 'Customer Portal' : 'Reviewer Portal'}
              </span>
            </Link>

            <nav className="hidden md:flex space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition ${
                      active
                        ? 'bg-navy-800 text-white'
                        : 'text-slate-300 hover:bg-navy-800/60 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-slate-300 hover:text-white hover:bg-navy-800 transition border border-navy-700"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
