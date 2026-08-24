import { createContext, useContext, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../lib/api";

export type Role = "retail" | "corporate" | "admin" | "issuer" | "campaign_manager";

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  isDemoReviewer: boolean;
  effectiveRole: Role;
}

// Barrier 1: a lightweight, role-less signup capturing identity only
// (email/password + the mocked IC-scan/selfie result reviewed in step 4).
export interface KycProfileSignup {
  fullName: string;
  icNumber?: string;
  dob?: string;
  nationality?: string;
  address?: string;
  gender?: string;
  ocrOverridden?: boolean;
  faceMatchScore?: number;
  livenessPassed?: boolean;
}
export interface SignupInput {
  email: string;
  password: string;
  displayName: string;
  kycProfile?: KycProfileSignup;
}

// Barrier 2: activating a sub-profile is what actually creates an
// investor/issuer/corporate account, wallet and compliance case.
export interface IndividualActivationInput {
  jobType?: string;
  companyName?: string;
  incomeRange?: string;
  netWorth?: string;
  sourceOfFunds?: string;
  bankName?: string;
  bankAccountNumber?: string;
}
export interface CorporateActivationInput {
  companyName: string;
  registrationNumber?: string;
  legalEntityType?: string;
  sourceOfFunds?: string;
  netAssetsRange?: string;
  bankName?: string;
  bankAccountNumber?: string;
}
export interface IssuerActivationInput {
  companyName: string;
  registrationNumber?: string;
  legalEntityType?: string;
  amountToRaise?: number;
  tenure?: string;
  purpose?: string;
}

interface AuthContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
  switchRole: (role: Role) => Promise<void>;
  activateIndividual: (input: IndividualActivationInput) => Promise<void>;
  activateCorporate: (input: CorporateActivationInput) => Promise<void>;
  activateIssuer: (input: IssuerActivationInput) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        const res = await apiGet<{ user: SessionUser }>("/api/auth/me");
        return res.user;
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  const loginMutation = useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      apiPost<{ user: SessionUser }>("/api/auth/login", vars),
    onSuccess: (res) => qc.setQueryData(["me"], res.user),
  });

  const signupMutation = useMutation({
    mutationFn: (vars: SignupInput) => apiPost<{ user: SessionUser }>("/api/auth/signup", vars),
    onSuccess: (res) => qc.setQueryData(["me"], res.user),
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiPost("/api/auth/logout"),
    onSuccess: () => {
      qc.setQueryData(["me"], null);
      qc.clear();
    },
  });

  const switchRoleMutation = useMutation({
    mutationFn: (role: Role) => apiPost<{ user: SessionUser }>("/api/auth/switch-role", { role }),
    onSuccess: (res) => {
      qc.setQueryData(["me"], res.user);
      qc.invalidateQueries();
    },
  });

  const activateIndividualMutation = useMutation({
    mutationFn: (vars: IndividualActivationInput) => apiPost<{ user: SessionUser }>("/api/activate/individual", vars),
    onSuccess: (res) => {
      qc.setQueryData(["me"], res.user);
      qc.invalidateQueries();
    },
  });
  const activateCorporateMutation = useMutation({
    mutationFn: (vars: CorporateActivationInput) => apiPost<{ user: SessionUser }>("/api/activate/corporate", vars),
    onSuccess: (res) => {
      qc.setQueryData(["me"], res.user);
      qc.invalidateQueries();
    },
  });
  const activateIssuerMutation = useMutation({
    mutationFn: (vars: IssuerActivationInput) => apiPost<{ user: SessionUser }>("/api/activate/issuer", vars),
    onSuccess: (res) => {
      qc.setQueryData(["me"], res.user);
      qc.invalidateQueries();
    },
  });

  const value: AuthContextValue = {
    user: meQuery.data ?? null,
    isLoading: meQuery.isLoading,
    login: async (email, password) => {
      await loginMutation.mutateAsync({ email, password });
    },
    signup: async (input) => {
      await signupMutation.mutateAsync(input);
    },
    logout: async () => {
      await logoutMutation.mutateAsync();
    },
    switchRole: async (role) => {
      await switchRoleMutation.mutateAsync(role);
    },
    activateIndividual: async (input) => {
      await activateIndividualMutation.mutateAsync(input);
    },
    activateCorporate: async (input) => {
      await activateCorporateMutation.mutateAsync(input);
    },
    activateIssuer: async (input) => {
      await activateIssuerMutation.mutateAsync(input);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
