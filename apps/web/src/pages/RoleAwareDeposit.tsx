import { useAuth } from "../context/AuthContext";
import Deposit from "./retail/Deposit";
import CorporateDeposit from "./corporate/Deposit";

export default function RoleAwareDeposit() {
  const { user } = useAuth();
  const effectiveRole = user?.effectiveRole ?? user?.role;
  if (effectiveRole === "corporate") return <CorporateDeposit />;
  return <Deposit />;
}
