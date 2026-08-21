import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./components/Toast";
import AppShell from "./components/layout/AppShell";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import RoleAwareOverview from "./pages/RoleAwareOverview";
import RoleAwareMarketplace from "./pages/RoleAwareMarketplace";
import RoleAwareDeposit from "./pages/RoleAwareDeposit";
import RoleAwareWithdrawal from "./pages/RoleAwareWithdrawal";
import OngoingNotes from "./pages/retail/OngoingNotes";
import CompletedNotes from "./pages/retail/CompletedNotes";
import AutoInvest from "./pages/retail/AutoInvest";
import AccountBalance from "./pages/retail/AccountBalance";
import Alerts from "./pages/retail/Alerts";
import Statements from "./pages/retail/Statements";
import Account from "./pages/retail/Account";
import Investors from "./pages/admin/Investors";
import Issuers from "./pages/admin/Issuers";
import RiskApprovals from "./pages/admin/RiskApprovals";
import AdminActivity from "./pages/admin/Activity";
import Reports from "./pages/admin/Reports";
import Financing from "./pages/issuer/Financing";
import Repayments from "./pages/issuer/Repayments";
import Documents from "./pages/issuer/Documents";
import CorporateActivity from "./pages/corporate/Activity";

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/app/overview" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<RoleAwareOverview />} />
            <Route path="notes-available" element={<RoleAwareMarketplace />} />
            <Route path="ongoing-notes" element={<OngoingNotes />} />
            <Route path="completed-notes" element={<CompletedNotes />} />
            <Route path="auto-invest" element={<AutoInvest />} />
            <Route path="account-balance" element={<AccountBalance />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="deposit" element={<RoleAwareDeposit />} />
            <Route path="withdrawal" element={<RoleAwareWithdrawal />} />
            <Route path="statements" element={<Statements />} />
            <Route path="account" element={<Account />} />
            <Route path="investors" element={<Investors />} />
            <Route path="issuers" element={<Issuers />} />
            <Route path="risk-approvals" element={<RiskApprovals />} />
            <Route path="admin-activity-log" element={<AdminActivity />} />
            <Route path="reports" element={<Reports />} />
            <Route path="financing" element={<Financing />} />
            <Route path="repayments" element={<Repayments />} />
            <Route path="documents" element={<Documents />} />
            <Route path="activity-log" element={<CorporateActivity />} />
          </Route>
          <Route path="*" element={<Navigate to="/app/overview" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
