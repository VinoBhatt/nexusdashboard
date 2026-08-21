import { useAuth } from "../context/AuthContext";
import Withdrawal from "./retail/Withdrawal";
import CorporateWithdrawal from "./corporate/Withdrawal";

export default function RoleAwareWithdrawal() {
  const { user } = useAuth();
  const effectiveRole = user?.effectiveRole ?? user?.role;
  if (effectiveRole === "corporate") return <CorporateWithdrawal />;
  return <Withdrawal />;
}
