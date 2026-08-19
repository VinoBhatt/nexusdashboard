import { PageHeader } from "../components/layout/PageHeader";
import { useAuth } from "../context/AuthContext";

const ROLE_LABEL: Record<string, string> = {
  corporate: "Corporate investor",
  admin: "CEO / admin",
  issuer: "Issuer / borrower",
};

export default function ComingSoon() {
  const { user } = useAuth();
  const label = ROLE_LABEL[user?.effectiveRole ?? user?.role ?? ""] ?? "This";
  return (
    <>
      <PageHeader title="Overview" description={`${label} dashboard`} />
      <div className="card">
        <h3>Coming in the next phase</h3>
        <p className="sub">
          The {label.toLowerCase()} dashboard is being rebuilt next, following the same real-data
          approach as the retail dashboard. Switch back to Retail from the sidebar to see it live.
        </p>
      </div>
    </>
  );
}
