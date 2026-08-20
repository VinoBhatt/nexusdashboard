import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./components/Toast";
import AppShell from "./components/layout/AppShell";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import RoleAwareOverview from "./pages/RoleAwareOverview";
import NotesAvailable from "./pages/retail/NotesAvailable";
import OngoingNotes from "./pages/retail/OngoingNotes";
import CompletedNotes from "./pages/retail/CompletedNotes";
import Deposit from "./pages/retail/Deposit";
import Withdrawal from "./pages/retail/Withdrawal";
import Statements from "./pages/retail/Statements";
import Account from "./pages/retail/Account";
import Investors from "./pages/admin/Investors";
import Issuers from "./pages/admin/Issuers";
import RiskApprovals from "./pages/admin/RiskApprovals";
import Financing from "./pages/issuer/Financing";
import Repayments from "./pages/issuer/Repayments";
import Documents from "./pages/issuer/Documents";

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
            <Route path="notes-available" element={<NotesAvailable />} />
            <Route path="ongoing-notes" element={<OngoingNotes />} />
            <Route path="completed-notes" element={<CompletedNotes />} />
            <Route path="deposit" element={<Deposit />} />
            <Route path="withdrawal" element={<Withdrawal />} />
            <Route path="statements" element={<Statements />} />
            <Route path="account" element={<Account />} />
            <Route path="investors" element={<Investors />} />
            <Route path="issuers" element={<Issuers />} />
            <Route path="risk-approvals" element={<RiskApprovals />} />
            <Route path="financing" element={<Financing />} />
            <Route path="repayments" element={<Repayments />} />
            <Route path="documents" element={<Documents />} />
          </Route>
          <Route path="*" element={<Navigate to="/app/overview" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
