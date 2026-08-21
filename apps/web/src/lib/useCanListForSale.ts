import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import { useAuth } from "../context/AuthContext";

// Retail investors can always list a holding for sale. Corporate accounts
// share one pool of holdings, but only the Maker acts on them - the Checker
// approves money-moving orders, not asset disposals, which don't need
// dual sign-off since listing alone doesn't move any money.
export function useCanListForSale(): boolean {
  const { user } = useAuth();
  const effectiveRole = user?.effectiveRole ?? user?.role;
  const { data } = useQuery({
    queryKey: ["corporate", "overview"],
    queryFn: () => apiGet<{ myCorpRole: "maker" | "checker" }>("/api/corporate/overview"),
    enabled: effectiveRole === "corporate",
  });
  if (effectiveRole === "retail") return true;
  if (effectiveRole === "corporate") return data?.myCorpRole === "maker";
  return false;
}
