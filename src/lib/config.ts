import path from "node:path";
import { z } from "zod";

/**
 * The single place environment is read. Everything here is OPERATOR config set
 * at deploy/runtime — never an end-user setting (see feature-spec §3, §7, §9).
 *
 * Import `config` from here; never read `process.env` elsewhere.
 */

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Where the SQLite db, media, and backups live. Defaults to ./data locally;
  // the container sets DATA_DIR=/data explicitly.
  DATA_DIR: z.string().min(1).optional(),

  // AI Assist (OpenRouter). Blank key disables AI features.
  OPENROUTER_API_KEY: z.string().optional().default(""),
  OPENROUTER_MODEL: z.string().min(1).default("openai/gpt-4o"),

  // Off-site backup. Blank bucket disables scheduled backups.
  S3_ENDPOINT: z.string().optional().default(""),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().optional().default(""),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  BACKUP_CRON: z.string().min(1).default("0 3 * * *"),

  // Coverage + valuation tuning.
  COVERAGE_WARN_PCT: z.coerce.number().gt(0).lte(1).default(0.8),
  REVALUATION_CADENCE_DAYS: z.coerce.number().int().positive().default(90),
});

const parsed = envSchema.parse(process.env);

const dataDir = parsed.DATA_DIR
  ? path.resolve(parsed.DATA_DIR)
  : path.join(process.cwd(), "data");

export const config = {
  nodeEnv: parsed.NODE_ENV,
  isProd: parsed.NODE_ENV === "production",

  /** Resolved absolute paths under the data volume. */
  paths: {
    dataDir,
    dbFile: path.join(dataDir, "domiciledb.db"),
    backupDir: path.join(dataDir, "backup"),
    mediaDir: path.join(dataDir, "media"),
  },

  ai: {
    apiKey: parsed.OPENROUTER_API_KEY,
    model: parsed.OPENROUTER_MODEL,
    get enabled() {
      return parsed.OPENROUTER_API_KEY.length > 0;
    },
  },

  backup: {
    endpoint: parsed.S3_ENDPOINT,
    region: parsed.S3_REGION,
    bucket: parsed.S3_BUCKET,
    accessKeyId: parsed.S3_ACCESS_KEY_ID,
    secretAccessKey: parsed.S3_SECRET_ACCESS_KEY,
    cron: parsed.BACKUP_CRON,
    get enabled() {
      return parsed.S3_BUCKET.length > 0;
    },
  },

  coverage: {
    /** Fraction of Coverage B at which the "approaching limit" nudge fires. */
    warnPct: parsed.COVERAGE_WARN_PCT,
  },

  valuation: {
    /** Days after which a replacement-cost value is considered stale. */
    revaluationCadenceDays: parsed.REVALUATION_CADENCE_DAYS,
  },
} as const;

export type AppConfig = typeof config;
