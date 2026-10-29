import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import ConfirmPage from '@/pages/ConfirmPage';
import CustomerDashboardPage from '@/pages/CustomerDashboardPage';
import DocumentUploadPage from '@/pages/DocumentUploadPage';
import KYCStatusHistoryPage from '@/pages/KYCStatusHistoryPage';
import ReviewerDashboardPage from '@/pages/ReviewerDashboardPage';
import ReviewQueuePage from '@/pages/ReviewQueuePage';
import CaseDetailPage from '@/pages/CaseDetailPage';
import { CustomerLayout, ReviewerLayout } from '@/components/layout/PortalLayouts';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Auth Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/confirm" element={<ConfirmPage />} />

        {/* Protected Customer Routes */}
        <Route element={<CustomerLayout />}>
          <Route path="/dashboard" element={<CustomerDashboardPage />} />
          <Route path="/kyc/upload" element={<DocumentUploadPage />} />
          <Route path="/kyc/status" element={<KYCStatusHistoryPage />} />
        </Route>

        {/* Protected Reviewer Routes */}
        <Route path="/reviewer" element={<ReviewerLayout />}>
          <Route path="dashboard" element={<ReviewerDashboardPage />} />
          <Route path="queue" element={<ReviewQueuePage />} />
          <Route path="cases/detail" element={<CaseDetailPage />} />
        </Route>

        {/* Default Redirect */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
