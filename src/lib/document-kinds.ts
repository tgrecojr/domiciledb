/**
 * Client-safe document kind metadata (no `server-only`/DB). Single source of
 * truth; the DB schema imports DOCUMENT_KINDS from here.
 */
export const DOCUMENT_KINDS = ["receipt", "warranty", "manual"] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  receipt: "Receipt",
  warranty: "Warranty",
  manual: "Manual",
};
