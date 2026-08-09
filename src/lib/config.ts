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
  OPENROUTER_BASE_URL: z
    .string()
    .min(1)
    .default("https://openrouter.ai/api/v1"),
  // Site URL sent as HTTP-Referer so OpenRouter attributes usage to this app.
  OPENROUTER_REFERER: z.string().optional().default(""),
  // Ceiling on paid AI calls per hour across the whole process (spend guard).
  AI_MAX_CALLS_PER_HOUR: z.coerce.number().int().min(0).default(60),
  // Test-only: return canned AI responses instead of calling OpenRouter.
  AI_FAKE: z
    .enum(["0", "1"])
    .optional()
    .default("0")
    .transform((v) => v === "1"),

  // Off-site backup. Blank bucket disables scheduled backups.
  S3_ENDPOINT: z.string().optional().default(""),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().optional().default(""),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  BACKUP_CRON: z.string().min(1).default("0 3 * * *"),

  // Upload + media-storage ceilings (no auth in front of the capture forms).
  UPLOAD_MAX_FILE_MB: z.coerce.number().positive().default(25),
  UPLOAD_MAX_FILES_PER_REQUEST: z.coerce.number().int().positive().default(20),
  MEDIA_MAX_TOTAL_MB: z.coerce.number().min(0).default(20480),
  // Largest single file /api/media will serve.
  MEDIA_MAX_SERVE_MB: z.coerce.number().positive().default(100),

  // Minimum seconds between full /api/export runs (a VACUUM + whole-tree zip).
  EXPORT_MIN_INTERVAL_SECONDS: z.coerce.number().int().min(0).default(60),

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
    backupSnapshot: path.join(dataDir, "backup", "domiciledb-snapshot.db"),
    latestPdf: path.join(dataDir, "backup", "proof-packet-latest.pdf"),
    backupStatus: path.join(dataDir, "backup", "status.json"),
    mediaDir: path.join(dataDir, "media"),
  },

  ai: {
    apiKey: parsed.OPENROUTER_API_KEY,
    model: parsed.OPENROUTER_MODEL,
    baseUrl: parsed.OPENROUTER_BASE_URL,
    referer: parsed.OPENROUTER_REFERER,
    /** App name reported to OpenRouter (X-OpenRouter-Title) for attribution. */
    title: "DomicileDB",
    fake: parsed.AI_FAKE,
    /** Paid calls allowed per rolling hour; extra calls are refused unsent. */
    maxCallsPerHour: parsed.AI_MAX_CALLS_PER_HOUR,
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

  uploads: {
    /** Largest single accepted upload. */
    maxFileBytes: Math.floor(parsed.UPLOAD_MAX_FILE_MB * 1024 * 1024),
    /** Most files honoured from one multipart request. */
    maxFilesPerRequest: parsed.UPLOAD_MAX_FILES_PER_REQUEST,
    /** Ceiling on total bytes stored under DATA_DIR/media. */
    maxMediaTotalBytes: Math.floor(parsed.MEDIA_MAX_TOTAL_MB * 1024 * 1024),
    /** Largest single file the media route will serve. */
    maxServeBytes: Math.floor(parsed.MEDIA_MAX_SERVE_MB * 1024 * 1024),
  },

  export: {
    /** Minimum gap between full exports; extra requests get 429 (no auth here). */
    minIntervalMs: parsed.EXPORT_MIN_INTERVAL_SECONDS * 1000,
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
