export const roles = ["retail", "corporate", "admin", "issuer"] as const;
export type Role = (typeof roles)[number];

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  isDemoReviewer: boolean;
}
