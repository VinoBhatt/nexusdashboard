import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut, apiPostForm, apiDelete } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { DataTable, type Column } from "../../components/data/DataTable";
import { NATURE_OF_JOB, NATURE_OF_BUSINESS, GROSS_ANNUAL_INCOME, NET_WORTH, SOURCE_OF_FUNDS, BANKS, STATES, COUNTRIES } from "../../lib/profileOptions";

interface Profile {
  displayName: string;
  email: string;
  investorRefNo: string | null;
  contactNumber: string | null;
  identificationType: string | null;
  identificationNumber: string | null;
  jobType: string | null;
  jobTitle: string | null;
  companyName: string | null;
  natureOfBusiness: string | null;
  incomeRange: string | null;
  netWorth: string | null;
  sourceOfFunds: string | null;
  objective: string | null;
  riskAppetite: string | null;
  bankName: string | null;
  bankAccountHolder: string | null;
  bankAccountNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  country: string | null;
  state: string | null;
  postcode: string | null;
  referralCode: string | null;
  declarationAccepted: boolean;
  profileUpdatedAt: string | null;
}

interface Doc {
  id: string;
  docType: string;
  fileName: string;
  status: "Verified" | "Pending" | "Action required";
  uploadedAt: string;
}

const docColumns: Column<Doc>[] = [
  { key: "docType", label: "Document Type", sortable: true },
  { key: "fileName", label: "File Name", sortable: true },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (d) => <span className={`status ${d.status === "Verified" ? "ok" : d.status === "Action required" ? "default" : "pending"}`}>{d.status}</span>,
  },
  { key: "uploadedAt", label: "Uploaded", sortable: true, render: (d) => new Date(d.uploadedAt).toLocaleDateString() },
];

export default function Account() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<Partial<Profile>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();

  const { data } = useQuery({ queryKey: ["account", "profile"], queryFn: () => apiGet<Profile>("/api/account/profile") });
  const { data: docsData } = useQuery({ queryKey: ["account", "documents"], queryFn: () => apiGet<{ documents: Doc[] }>("/api/account/documents") });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: () => apiPut("/api/account/profile", form),
    onSuccess: () => {
      toast("Profile details updated successfully.");
      qc.invalidateQueries({ queryKey: ["account", "profile"] });
    },
  });

  const uploadDoc = useMutation({
    mutationFn: ({ docType, file }: { docType: string; file: File }) => {
      const fd = new FormData();
      fd.set("docType", docType);
      fd.set("file", file);
      return apiPostForm("/api/account/documents", fd);
    },
    onSuccess: () => {
      toast("Document uploaded and pending review.");
      qc.invalidateQueries({ queryKey: ["account", "documents"] });
    },
    onError: (e: Error) => toast(e.message),
  });

  const deleteAccount = useMutation({
    mutationFn: () => apiDelete("/api/account"),
    onSuccess: async () => {
      toast("Account deleted.");
      qc.clear();
      navigate("/login");
    },
    onError: (e: Error) => {
      setConfirmDelete(false);
      toast(e.message === "forbidden" ? "Demo accounts cannot be deleted." : e.message);
    },
  });

  if (!data) return <PageHeader title="My Profile" description="Loading…" />;

  const field = (key: keyof Profile, label: string, options?: string[], required = false) => (
    <div className="field">
      <label htmlFor={`profile-${key}`}>
        {label}
        {required ? " *" : ""}
      </label>
      {options ? (
        <select id={`profile-${key}`} value={(form[key] as string) ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
          <option value="" disabled>
            Select…
          </option>
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input id={`profile-${key}`} value={(form[key] as string) ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      )}
    </div>
  );

  const upload = (docType: string, label: string) => {
    const existing = docsData?.documents.find((d) => d.docType === docType);
    const inputId = `profile-upload-${docType.replace(/[^a-zA-Z0-9]/g, "")}`;
    return (
      <div className="field">
        <label htmlFor={inputId}>{label} *</label>
        <input
          id={inputId}
          type="file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadDoc.mutate({ docType, file });
          }}
        />
        {existing && <div className="sub">On file: {existing.fileName} ({existing.status})</div>}
      </div>
    );
  };

  return (
    <>
      <PageHeader title="My Profile" description="Identity, financial background and account settings." />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-head">
          <h3>My Profile</h3>
          <button className="btn small primary" disabled={save.isPending} onClick={() => save.mutate()}>
            Confirm & Submit Your Changes
          </button>
        </div>
        <div className="grid cols-2">
          <div className="field">
            <label htmlFor="profileInvestorRefNo">Your Investor ID</label>
            <input id="profileInvestorRefNo" value={data.investorRefNo ?? "—"} disabled />
          </div>
          <div className="field">
            <label htmlFor="profileEmail">Email</label>
            <input id="profileEmail" value={data.email} disabled />
          </div>
          {field("displayName", "Full Legal Name", undefined, true)}
          {field("contactNumber", "Contact Number", undefined, true)}
          {field("identificationType", "Identification Type", ["NRIC", "Passport"], true)}
          {field("identificationNumber", "Identification Number", undefined, true)}
          {upload("IC/Passport (front)", "Upload IC/Passport (front)")}
          {upload("IC/Passport (back)", "Upload IC/Passport (back)")}
          {field("sourceOfFunds", "Source of Funds", SOURCE_OF_FUNDS, true)}
          {field("jobType", "Nature of Job", NATURE_OF_JOB, true)}
          {field("jobTitle", "Job Title")}
          {field("companyName", "Company Name")}
          {field("natureOfBusiness", "Nature of Business", NATURE_OF_BUSINESS)}
          {field("netWorth", "Total Net Worth", NET_WORTH, true)}
          {field("incomeRange", "Gross Annual Income", GROSS_ANNUAL_INCOME, true)}
          <div className="field">
            <label htmlFor="profileUpdatedAt">Last Updated</label>
            <input id="profileUpdatedAt" value={data.profileUpdatedAt ? new Date(data.profileUpdatedAt).toLocaleString() : "Never"} disabled />
          </div>
        </div>
        <label className="row" style={{ marginTop: 14, gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={form.declarationAccepted ?? false}
            onChange={(e) => setForm({ ...form, declarationAccepted: e.target.checked })}
          />
          <span className="sub">I declare that the information provided is true and up to date.</span>
        </label>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-head">
          <h3>Documents</h3>
        </div>
        <DataTable columns={docColumns} rows={docsData?.documents ?? []} emptyMessage="No documents uploaded yet." />
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="section-head">
            <h3>Bank Account</h3>
          </div>
          {field("bankName", "Bank", BANKS, true)}
          {field("bankAccountHolder", "Account Holder", undefined, true)}
          {field("bankAccountNumber", "Account Number", undefined, true)}
          {upload("Bank Statement", "Bank Statement")}
        </div>

        <div className="card">
          <div className="section-head">
            <h3>Mailing Address</h3>
          </div>
          {field("addressLine1", "Address Line 1")}
          {field("addressLine2", "Address Line 2")}
          <div className="grid cols-2">
            {field("city", "City/Town")}
            {field("postcode", "Postcode")}
          </div>
          <div className="grid cols-2">
            {field("country", "Country", COUNTRIES)}
            {field("state", "State", STATES)}
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="section-head">
            <h3>Refer a Friend</h3>
          </div>
          <div className="field">
            <label htmlFor="profileReferralCode">Your Referral Code</label>
            <input id="profileReferralCode" value={data.referralCode ?? "—"} disabled />
          </div>
        </div>

        <div className="card">
          <div className="section-head">
            <h3>Danger Zone</h3>
          </div>
          <p className="sub">Permanently delete your account and all associated data. This cannot be undone.</p>
          <button
            className="btn small danger"
            disabled={user?.isDemoReviewer}
            title={user?.isDemoReviewer ? "Demo accounts cannot be deleted." : undefined}
            onClick={() => setConfirmDelete(true)}
          >
            Delete Account
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete account"
        description="This permanently deletes your account, holdings and transaction history. This cannot be undone."
        confirmLabel="Delete Account"
        danger
        onConfirm={() => deleteAccount.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
