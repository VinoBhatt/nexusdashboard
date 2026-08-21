import { useAuth } from "../context/AuthContext";
import NotesAvailable from "./retail/NotesAvailable";
import CorporateMarketplace from "./corporate/Marketplace";

export default function RoleAwareMarketplace() {
  const { user } = useAuth();
  const effectiveRole = user?.effectiveRole ?? user?.role;
  if (effectiveRole === "corporate") return <CorporateMarketplace />;
  return <NotesAvailable />;
}
