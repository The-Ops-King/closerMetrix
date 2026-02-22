/**
 * APP — Root Router
 *
 * Three main route groups:
 *   /d/:token/*     — Client dashboard (token-authenticated)
 *   /admin/*        — Admin panel (API key authenticated)
 *   /partner/:token — Partner portal (partner token authenticated)
 *
 * The client dashboard uses nested routes inside a DashboardShell layout.
 * The admin client detail view (/admin/clients/:clientId/*) reuses the same
 * page components via nested routes within ClientDetail's DashboardShell.
 * Admin and partner have their own layouts.
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';

// Client dashboard pages
import ClientDashboardLayout from './pages/client/ClientDashboardLayout';
import OverviewPage from './pages/client/OverviewPage';
import FinancialPage from './pages/client/FinancialPage';
import AttendancePage from './pages/client/AttendancePage';
import CallOutcomesPage from './pages/client/CallOutcomesPage';
import SalesCyclePage from './pages/client/SalesCyclePage';
import ObjectionsPage from './pages/client/ObjectionsPage';
import ProjectionsPage from './pages/client/ProjectionsPage';
import ViolationsPage from './pages/client/ViolationsPage';
import AdherencePage from './pages/client/AdherencePage';

// Admin pages
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import ClientDetail from './pages/admin/ClientDetail';
import TokenManager from './pages/admin/TokenManager';
import AdminApiConsole from './pages/admin/AdminApiConsole';

// Partner pages
import PartnerDashboard from './pages/partner/PartnerDashboard';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ── Client Dashboard ── */}
          {/* /d/:token is the shared secret link clients receive */}
          <Route path="/d/:token" element={<ClientDashboardLayout />}>
            {/* Default: Overview page */}
            <Route index element={<OverviewPage />} />
            <Route path="overview" element={<OverviewPage />} />

            {/* Insight+ pages */}
            <Route path="financial" element={<FinancialPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="call-outcomes" element={<CallOutcomesPage />} />
            <Route path="sales-cycle" element={<SalesCyclePage />} />
            <Route path="objections" element={<ObjectionsPage />} />
            <Route path="projections" element={<ProjectionsPage />} />

            {/* Executive pages */}
            <Route path="violations" element={<ViolationsPage />} />
            <Route path="adherence" element={<AdherencePage />} />
          </Route>

          {/* ── Admin Panel ── */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/tokens" element={<TokenManager />} />
          <Route path="/admin/api-console" element={<AdminApiConsole />} />

          {/* Admin client detail — renders the client's full dashboard */}
          {/* Uses the same page components as client dashboard */}
          <Route path="/admin/clients/:clientId" element={<ClientDetail />}>
            <Route index element={<OverviewPage />} />
            <Route path="overview" element={<OverviewPage />} />
            <Route path="financial" element={<FinancialPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="call-outcomes" element={<CallOutcomesPage />} />
            <Route path="sales-cycle" element={<SalesCyclePage />} />
            <Route path="objections" element={<ObjectionsPage />} />
            <Route path="projections" element={<ProjectionsPage />} />
            <Route path="violations" element={<ViolationsPage />} />
            <Route path="adherence" element={<AdherencePage />} />
          </Route>

          {/* ── Partner Portal ── */}
          <Route path="/partner/:token" element={<PartnerDashboard />} />

          {/* ── Catch-all: redirect to admin login ── */}
          <Route path="*" element={<Navigate to="/admin/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
