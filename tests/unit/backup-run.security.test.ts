import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * VULN-006 (CWE-209 + CWE-497): the unauthenticated /resilience page must not
 * disclose operator infrastructure detail — neither the S3 bucket/endpoint/cron
 * nor the verbatim AWS SDK error text an attacker can force on demand.
 *
 * VULN-011 (CWE-400): `runBackup` must be single-flight, so the cron tick and
 * the unauthenticated "Back up now" action can't multiply S3 LIST/PUT + egress.
 */

const fixture = vi.hoisted(() => {
	// No imports in here: vi.hoisted runs before the module's own imports.
	const dataDir = `${process.env.TMPDIR ?? "/tmp"}/vuln006-${process.pid}`;
	const sdkError =
		"connect ECONNREFUSED 10.13.37.42:9000 while PutObject to bucket domiciledb-prod-offsite-backups";
	// VULN-006 needs the S3 PUT to blow up so the SDK text is in play; VULN-011
	// needs it to succeed so the run reaches the LIST it must not duplicate.
	const state = { putObjectFails: true };
	return {
		dataDir,
		snapshotPath: `${dataDir}/snap.db`,
		bucket: "domiciledb-prod-offsite-backups",
		endpoint: "http://10.13.37.42:9000",
		cron: "17 2 * * *",
		sdkError,
		state,
		createSnapshot: vi.fn(() => ({ path: `${dataDir}/snap.db`, bytes: 14 })),
		putObject: vi.fn(async () => {
			if (state.putObjectFails) throw new Error(sdkError);
		}),
		listKeys: vi.fn(async () => new Set<string>()),
	};
});

fs.mkdirSync(fixture.dataDir, { recursive: true });
fs.writeFileSync(fixture.snapshotPath, "snapshot-bytes");

process.env.DATA_DIR = fixture.dataDir;
process.env.S3_BUCKET = fixture.bucket;
process.env.S3_ENDPOINT = fixture.endpoint;
process.env.S3_ACCESS_KEY_ID = "AKIAEXAMPLEOPERATORKEY";
process.env.S3_SECRET_ACCESS_KEY = "s3cr3t-operator-secret";
process.env.BACKUP_CRON = fixture.cron;

// Keep the unit test off the native sqlite/S3/PDF stack: the vulnerability
// lives in what runBackup persists and what the page renders, not in them.
vi.mock("@/db", () => ({
	db: {
		select: () => ({
			from: () => ({ limit: () => ({ get: () => undefined }) }),
		}),
	},
}));
vi.mock("@/lib/backup/snapshot", () => ({
	createSnapshot: fixture.createSnapshot,
}));
vi.mock("@/lib/backup/s3", () => ({
	putObject: fixture.putObject,
	listKeys: fixture.listKeys,
	getObject: vi.fn(),
}));
vi.mock("@/lib/pdf/render", () => ({
	renderProofPacket: vi.fn(async () => Buffer.from("%PDF")),
}));
vi.mock("@/lib/queries/report", () => ({ getReportPacket: () => null }));
vi.mock("@/lib/queries/household", () => ({ getHouseholdId: async () => 1 }));
vi.mock("@/lib/actions/backup", () => ({ backupNowAction: async () => {} }));
vi.mock("@/components/app-shell", () => ({
	AppShell: ({ children }: { children: React.ReactNode }) => children,
}));

const SECRETS = [
	fixture.bucket,
	fixture.endpoint,
	fixture.cron,
	"ECONNREFUSED",
	"10.13.37.42",
];

function expectNoOperatorDetail(text: string) {
	for (const secret of SECRETS) {
		expect(text).not.toContain(secret);
	}
}

describe("VULN-006 backup failure disclosure", () => {
	beforeEach(() => {
		fixture.state.putObjectFails = true;
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("never persists third-party SDK error text into the backup status", async () => {
		const { runBackup } = await import("@/lib/backup/run");
		const status = await runBackup(new Date().toISOString());

		expect(status.status).toBe("error");
		expectNoOperatorDetail(JSON.stringify(status));

		const onDisk = fs.readFileSync(
			path.join(fixture.dataDir, "backup", "status.json"),
			"utf8",
		);
		expectNoOperatorDetail(onDisk);
	});

	it("never hands the page an error field, even from a legacy status file", async () => {
		const { readBackupStatus } = await import("@/lib/backup/run");
		const statusFile = path.join(fixture.dataDir, "backup", "status.json");
		fs.mkdirSync(path.dirname(statusFile), { recursive: true });
		fs.writeFileSync(
			statusFile,
			JSON.stringify({
				at: "2026-01-01T00:00:00.000Z",
				status: "error",
				error: fixture.sdkError,
			}),
		);

		expectNoOperatorDetail(JSON.stringify(readBackupStatus()));
	});

	it("renders no bucket, endpoint, cron or SDK error on /resilience", async () => {
		const statusFile = path.join(fixture.dataDir, "backup", "status.json");
		fs.mkdirSync(path.dirname(statusFile), { recursive: true });
		fs.writeFileSync(
			statusFile,
			JSON.stringify({
				at: "2026-01-01T00:00:00.000Z",
				status: "error",
				error: fixture.sdkError,
			}),
		);

		const { default: ResiliencePage } = await import("@/app/resilience/page");
		const markup = renderToStaticMarkup(await ResiliencePage());

		expectNoOperatorDetail(markup);
	});
});

describe("runBackup single-flight (VULN-011)", () => {
	beforeEach(() => {
		fixture.state.putObjectFails = false;
		fixture.createSnapshot.mockClear();
		fixture.putObject.mockClear();
		fixture.listKeys.mockClear();
	});

	it("collapses overlapping callers into one run", async () => {
		const { runBackup } = await import("@/lib/backup/run");
		const now = new Date().toISOString();
		const results = await Promise.all([
			runBackup(now),
			runBackup(now),
			runBackup(now),
			runBackup(now),
		]);

		// One snapshot + one S3 LIST serve all four overlapping callers.
		expect(fixture.createSnapshot).toHaveBeenCalledTimes(1);
		expect(fixture.listKeys).toHaveBeenCalledTimes(1);
		expect(results.every((r) => r.status === results[0]!.status)).toBe(true);
	});
});
