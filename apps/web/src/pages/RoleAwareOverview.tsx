import { useAuth } from "../context/AuthContext";
import RetailOverview from "./retail/Overview";
import CorporateOverview from "./corporate/Overview";
import ComingSoon from "./ComingSoon";

export default function RoleAwareOverview() {
  const { user } = useAuth();
  const effectiveRole = user?.effectiveRole ?? user?.role;
  if (effectiveRole === "retail") return <RetailOverview />;
  if (effectiveRole === "corporate") return <CorporateOverview />;
  return <ComingSoon />;
}
