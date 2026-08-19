import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Auth foundation (Phase 1). Remaining domain tables (investor_profiles,
// corporate_accounts, financing_facilities, holdings, transactions,
// approvals, documents, statements, ...) are added incrementally per
// phase in the rebuild plan - see C:\Users\admin\.claude\plans\idempotent-gliding-allen.md

export const roles = ["retail", "corporate", "admin", "issuer"] as const;
export type Role = (typeof roles)[number];

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: roles }).notNull(),
  displayName: text("display_name").notNull(),
  isDemoReviewer: integer("is_demo_reviewer", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), // SHA-256 hash of the raw cookie token
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  activeRole: text("active_role", { enum: roles }), // demo role-switch override
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  actorId: text("actor_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  subjectType: text("subject_type"),
  subjectId: text("subject_id"),
  metadataJson: text("metadata_json"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Placeholder so the pipeline (Drizzle -> D1 -> API) has something to
// query end-to-end before Phase 1's full investor/issuer schema lands.
export const platformStats = sqliteTable("platform_stats", {
  key: text("key").primaryKey(),
  value: real("value").notNull(),
});
