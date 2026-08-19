import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./components/Toast";
import AppShell from "./components/layout/AppShell";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import RoleAwareOverview from "./pages/RoleAwareOverview";
import Marketplace from "./pages/retail/Marketplace";
import Portfolio from "./pages/retail/Portfolio";
import Deposit from "./pages/retail/Deposit";
import Withdrawal from "./pages/retail/Withdrawal";
import Statements from "./pages/retail/Statements";
import Account from "./pages/retail/Account";

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
            <Route path="marketplace" element={<Marketplace />} />
            <Route path="portfolio" element={<Portfolio />} />
            <Route path="deposit" element={<Deposit />} />
            <Route path="withdrawal" element={<Withdrawal />} />
            <Route path="statements" element={<Statements />} />
            <Route path="account" element={<Account />} />
          </Route>
          <Route path="*" element={<Navigate to="/app/overview" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
