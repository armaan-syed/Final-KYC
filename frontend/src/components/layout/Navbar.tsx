import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  LogOut,
  LayoutDashboard,
  FileText,
  CheckCircle,
  ListOrdered,
  Building2,
  Lock,
  ChevronRight,
} from 'lucide-react';
import { logoutUser } from '@/lib/auth';

export function Navbar({ portalType }: { portalType: 'customer' | 'reviewer' }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logoutUser();
    navigate('/login');
  };

  const customerNav = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Upload Document', href: '/kyc/upload', icon: FileText },
    { label: 'KYC Status & History', href: '/kyc/status', icon: CheckCircle },
  ];

  const reviewerNav = [
    { label: 'Operations Dashboard', href: '/reviewer/dashboard', icon: LayoutDashboard },
    { label: 'Review Queue', href: '/reviewer/queue', icon: ListOrdered },
  ];

  const navItems = portalType === 'customer' ? customerNav : reviewerNav;

  return (
    <header className="sticky top-0 z-50 bg-sbi-dark text-white border-b border-slate-800/80 shadow-banking backdrop-blur-md">
      {/* Top Corporate Strip reminiscent of SBI YONO / Banking Portals */}
      <div className="bg-slate-950/80 border-b border-slate-800/60 py-1.5 px-4 sm:px-6 lg:px-8 text-[11px] text-slate-400">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 font-medium text-slate-300">
              <Building2 className="w-3.5 h-3.5 text-sbi-accent" />
              Pramāṇa Institutional Banking Platform
            </span>
            <span className="hidden sm:inline-block text-slate-600">|</span>
            <span className="hidden sm:flex items-center gap-1 text-emerald-400 font-semibold">
              <Lock className="w-3 h-3" />
              256-bit TLS Encrypted Session
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden md:inline font-mono text-[10px] bg-slate-800/80 px-2 py-0.5 rounded text-slate-300 border border-slate-700">
              AWS AP-SOUTH-1
            </span>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link
              to={portalType === 'customer' ? '/dashboard' : '/reviewer/dashboard'}
              className="flex items-center gap-3 group"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sbi-blue to-sbi-accent flex items-center justify-center text-white shadow-lg shadow-blue-900/30 group-hover:scale-105 transition-transform duration-200 border border-blue-400/20">
                <ShieldCheck className="w-5 h-5 text-blue-100" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-lg tracking-tight text-white font-sans">
                    Pramāṇa
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {portalType === 'customer' ? 'Customer Portal' : 'Reviewer Portal'}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-medium tracking-wide">
                  Automated KYC Verification Platform
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                      active
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                        : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-rose-400 hover:bg-slate-800/80 transition-all border border-slate-700/80 hover:border-rose-500/40"
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
