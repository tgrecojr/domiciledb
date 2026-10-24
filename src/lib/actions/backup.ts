"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { runBackup } from "@/lib/backup/run";

/** Manual "Back up now". No-op (skipped) when S3 isn't configured. */
// @spec RESILIENCE-UI-002, RESILIENCE-BACKUP-008
export async function backupNowAction() {
	await runBackup(new Date().toISOString());
	revalidatePath("/resilience");
	redirect("/resilience");
}
