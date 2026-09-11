import { useAuth } from "../context/AuthContext";
import RetailNotifications from "./retail/Notifications";
import IssuerNotifications from "./issuer/Notifications";
import ComingSoon from "./ComingSoon";

export default function RoleAwareNotifications() {
  const { user } = useAuth();
  const effectiveRole = user?.effectiveRole ?? user?.role;
  if (effectiveRole === "retail" || effectiveRole === "corporate") return <RetailNotifications />;
  if (effectiveRole === "issuer") return <IssuerNotifications />;
  return <ComingSoon />;
}
