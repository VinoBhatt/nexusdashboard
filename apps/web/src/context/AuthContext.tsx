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

export interface InvestorProfileSignup {
  contactNumber?: string;
  identificationType?: "NRIC" | "Passport";
  identificationNumber?: string;
  sourceOfFunds?: string;
  jobType?: string;
  incomeRange?: string;
}
export interface IssuerProfileSignup {
  companyName: string;
  registrationNumber?: string;
  sector?: string;
  registeredAddress?: string;
}
export interface SignupInput {
  email: string;
  password: string;
  displayName: string;
  role: "retail" | "issuer";
  investorProfile?: InvestorProfileSignup;
  issuerProfile?: IssuerProfileSignup;
}

interface AuthContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
  switchRole: (role: Role) => Promise<void>;
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
