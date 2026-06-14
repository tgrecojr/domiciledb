import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

import { LOCATION_KINDS } from "@/lib/location-kinds";

export { LOCATION_KINDS };

/**
 * DomicileDB schema — the single source of truth.
 *
 * Conventions:
 * - Money is stored as integer CENTS (never floats).
 * - Timestamps are stored as ISO-8601 text (UTC).
 * - Media paths are RELATIVE to DATA_DIR so restore is mount-independent.
 */

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

// ─── Household / Property ────────────────────────────────────────────────────
export const household = sqliteTable("household", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  address: text("address"),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

// ─── Location ────────────────────────────────────────────────────────────────
export const location = sqliteTable(
  "location",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    householdId: integer("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: LOCATION_KINDS }).notNull().default("room"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("location_household_idx").on(t.householdId)],
);

// ─── Category & Tags ─────────────────────────────────────────────────────────
export const category = sqliteTable("category", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const tag = sqliteTable("tag", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

// ─── Item / Asset ────────────────────────────────────────────────────────────
export const LIFECYCLE_STATUSES = [
  "active",
  "sold",
  "disposed",
  "gifted",
  "broken",
  "replaced",
] as const;

/** Draft = still in the "needs detail" worklist; complete = user-cleared. */
export const ITEM_STATUSES = ["draft", "complete"] as const;

export const item = sqliteTable(
  "item",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    householdId: integer("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    locationId: integer("location_id").references(() => location.id, {
      onDelete: "set null",
    }),
    categoryId: integer("category_id").references(() => category.id, {
      onDelete: "set null",
    }),

    title: text("title").notNull(),
    description: text("description"),
    manufacturer: text("manufacturer"),
    modelNumber: text("model_number"),
    serialNumber: text("serial_number"),
    quantity: integer("quantity").notNull().default(1),

    lifecycleStatus: text("lifecycle_status", { enum: LIFECYCLE_STATUSES })
      .notNull()
      .default("active"),
    lifecycleDate: text("lifecycle_date"),
    condition: text("condition"),
    ageEstimate: text("age_estimate"),

    // User-determined completeness (orthogonal to lifecycle).
    status: text("status", { enum: ITEM_STATUSES }).notNull().default("draft"),

    // Denormalized current replacement cost (PER ITEM, cents) for fast coverage
    // aggregation; sourced from the latest replacement-cost valuation row.
    currentReplacementCost: integer("current_replacement_cost"),
    currentReplacementValuedAt: text("current_replacement_valued_at"),

    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [
    index("item_household_idx").on(t.householdId),
    index("item_location_idx").on(t.locationId),
    index("item_status_idx").on(t.status),
    index("item_lifecycle_idx").on(t.lifecycleStatus),
  ],
);

export const itemTag = sqliteTable(
  "item_tag",
  {
    itemId: integer("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.tagId] })],
);

// ─── Valuation (history) ─────────────────────────────────────────────────────
export const VALUATION_KINDS = [
  "price_paid",
  "replacement_cost",
  "acv",
] as const;
export const VALUE_SOURCES = ["user", "ai"] as const;

export const valuation = sqliteTable(
  "valuation",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: VALUATION_KINDS }).notNull(),
    amount: integer("amount").notNull(), // cents
    valuedAt: text("valued_at").notNull().default(now),
    source: text("source", { enum: VALUE_SOURCES }).notNull().default("user"),
    note: text("note"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("valuation_item_idx").on(t.itemId)],
);

// ─── Photo ───────────────────────────────────────────────────────────────────
export const PHOTO_KINDS = ["general", "condition", "serial_plate"] as const;

export const photo = sqliteTable(
  "photo",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: PHOTO_KINDS }).notNull().default("general"),
    pathOriginal: text("path_original").notNull(),
    pathWeb: text("path_web").notNull(),
    pathThumb: text("path_thumb").notNull(),
    contentHash: text("content_hash").notNull(),
    width: integer("width"),
    height: integer("height"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("photo_item_idx").on(t.itemId)],
);

// ─── Document ────────────────────────────────────────────────────────────────
export const DOCUMENT_KINDS = ["receipt", "warranty", "manual"] as const;

export const document = sqliteTable(
  "document",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: DOCUMENT_KINDS }).notNull().default("receipt"),
    path: text("path").notNull(),
    contentHash: text("content_hash").notNull(),
    filename: text("filename").notNull(),
    warrantyExpiresAt: text("warranty_expires_at"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("document_item_idx").on(t.itemId)],
);

// ─── Policy / Coverage ───────────────────────────────────────────────────────
export const policy = sqliteTable("policy", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id")
    .notNull()
    .references(() => household.id, { onDelete: "cascade" }),
  // The v1 driver: overall Coverage B – Personal Property limit (cents).
  coverageBPersonalProperty: integer("coverage_b_personal_property"),
  // Reference-only headline coverages (cents).
  coverageADwelling: integer("coverage_a_dwelling"),
  coverageCLossOfUse: integer("coverage_c_loss_of_use"),
  deductible: integer("deductible"),
  policyNumber: text("policy_number"),
  insurer: text("insurer"),
  source: text("source", { enum: VALUE_SOURCES }).notNull().default("user"),
  updatedAt: text("updated_at").notNull().default(now),
});

// ─── AI interaction (transparency audit log) ─────────────────────────────────
export const AI_OUTCOMES = ["accepted", "edited", "rejected"] as const;

export const aiInteraction = sqliteTable("ai_interaction", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id").references(() => item.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  model: text("model").notNull(),
  promptText: text("prompt_text").notNull(),
  imageRefs: text("image_refs", { mode: "json" }).$type<string[]>(),
  requestSummary: text("request_summary", { mode: "json" }),
  response: text("response", { mode: "json" }),
  outcome: text("outcome", { enum: AI_OUTCOMES }),
  createdAt: text("created_at").notNull().default(now),
});

// ─── Reminder (generated by the scheduler scan) ──────────────────────────────
export const REMINDER_KINDS = ["revaluation", "warranty_expiry"] as const;

export const reminder = sqliteTable(
  "reminder",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id").references(() => item.id, {
      onDelete: "cascade",
    }),
    kind: text("kind", { enum: REMINDER_KINDS }).notNull(),
    dueAt: text("due_at").notNull(),
    dismissedAt: text("dismissed_at"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("reminder_due_idx").on(t.dueAt)],
);

// Convenience type exports.
export type Household = typeof household.$inferSelect;
export type Location = typeof location.$inferSelect;
export type Item = typeof item.$inferSelect;
export type Valuation = typeof valuation.$inferSelect;
export type Photo = typeof photo.$inferSelect;
export type Document = typeof document.$inferSelect;
export type Policy = typeof policy.$inferSelect;
