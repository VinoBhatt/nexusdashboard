import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPut } from "../../lib/api";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";

interface Profile {
  displayName: string;
  email: string;
  jobType: string | null;
  incomeRange: string | null;
  netWorth: string | null;
  sourceOfFunds: string | null;
  objective: string | null;
  riskAppetite: string | null;
  kycStatus: string;
}

export default function Account() {
  const { data } = useQuery({ queryKey: ["account", "profile"], queryFn: () => apiGet<Profile>("/api/account/profile") });
  const [form, setForm] = useState<Partial<Profile>>({});
  const toast = useToast();

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: () => apiPut("/api/account/profile", form),
    onSuccess: () => toast("Profile details updated successfully."),
  });

  if (!data) return <PageHeader title="Account" description="Loading…" />;

  const field = (key: keyof Profile, label: string, options?: string[]) => (
    <div className="field">
      <label>{label}</label>
      {options ? (
        <select value={(form[key] as string) ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input value={(form[key] as string) ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      )}
    </div>
  );

  return (
    <>
      <PageHeader title="Account" description="Profile details and statement settings." />
      <div className="grid cols-2">
        <div className="card">
          <div className="section-head">
            <h3>Personal Information</h3>
            <button className="btn small primary" disabled={save.isPending} onClick={() => save.mutate()}>
              Save changes
            </button>
          </div>
          <div className="grid cols-2">
            {field("displayName", "Full name")}
            <div className="field">
              <label>Email</label>
              <input value={data.email} disabled />
            </div>
            {field("jobType", "Job type", ["Employed", "Business owner", "Self-employed", "Retired"])}
            {field("incomeRange", "Income range", ["RM3k - RM5k", "RM5k - RM10k", "RM10k - RM20k", "RM20k+"])}
            {field("netWorth", "Net worth", ["Below RM100k", "RM100k - RM500k", "RM500k - RM1m", "RM1m+"])}
            {field("sourceOfFunds", "Source of funds", ["Employment income", "Business income", "Inheritance", "Savings"])}
            {field("objective", "Investment objective", ["Income generation", "Balanced return", "Capital preservation"])}
            {field("riskAppetite", "Risk appetite", ["Conservative", "Balanced", "Growth"])}
          </div>
        </div>
        <div className="card">
          <div className="section-head">
            <h3>Profile & Compliance Status</h3>
          </div>
          <div className="list">
            <div className="list-item">
              <div>
                <b>KYC status</b>
              </div>
              <span className={`status ${data.kycStatus === "Verified" ? "ok" : "pending"}`}>{data.kycStatus}</span>
            </div>
            <div className="list-item">
              <div>
                <b>Statement delivery</b>
                <div className="sub">Email + portal download enabled</div>
              </div>
              <span className="status ok">Enabled</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
