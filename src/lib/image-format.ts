/**
 * Content-sniffing for uploaded files. Admission MUST be decided on the actual
 * bytes — the same content sharp/libvips dispatches on — never the client
 * `File.type` string, which is trivially forged. We restrict to an explicit
 * decoder allowlist (jpeg, png, webp, heic/heif); svg/gif/tiff/bmp are
 * recognized only so they can be *rejected* before a libvips decoder is reached.
 * No `server-only` here: this is pure byte inspection, safe on either side.
 */

export type DetectedType =
	| "jpeg"
	| "png"
	| "webp"
	| "heic"
	| "gif"
	| "tiff"
	| "bmp"
	| "svg"
	| "pdf";

const ALLOWED_IMAGE = new Set<DetectedType>(["jpeg", "png", "webp", "heic"]);

const MIME_BY_TYPE: Partial<Record<DetectedType, string>> = {
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
	heic: "image/heic",
	pdf: "application/pdf",
};

// HEIF/HEIC ISO-BMFF brands we accept (matches the prior image/heic|heif set).
// AVIF is intentionally excluded — it was never on the allowlist.
const HEIF_BRANDS = new Set([
	"heic",
	"heix",
	"heif",
	"hevc",
	"hevx",
	"mif1",
	"msf1",
]);

/** Identify a file by its magic bytes, or null if unrecognized. */
export function detectFileType(buffer: Buffer): DetectedType | null {
	const b = buffer;
	if (b.length < 4) return null;
	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
	if (
		b.length >= 8 &&
		b[0] === 0x89 &&
		b[1] === 0x50 &&
		b[2] === 0x4e &&
		b[3] === 0x47 &&
		b[4] === 0x0d &&
		b[5] === 0x0a &&
		b[6] === 0x1a &&
		b[7] === 0x0a
	)
		return "png";
	if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38)
		return "gif";
	if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)
		return "pdf";
	if (b[0] === 0x42 && b[1] === 0x4d) return "bmp";
	if (
		(b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) ||
		(b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a)
	)
		return "tiff";
	if (
		b.length >= 12 &&
		b.toString("latin1", 0, 4) === "RIFF" &&
		b.toString("latin1", 8, 12) === "WEBP"
	)
		return "webp";
	if (b.length >= 12 && b.toString("latin1", 4, 8) === "ftyp") {
		if (HEIF_BRANDS.has(b.toString("latin1", 8, 12))) return "heic";
	}
	const head = b
		.toString("utf8", 0, Math.min(b.length, 256))
		.trimStart()
		.toLowerCase();
	if (
		head.startsWith("<svg") ||
		(head.startsWith("<?xml") && head.includes("<svg"))
	)
		return "svg";
	return null;
}

/** Sniffed image MIME for an allowed decoder format, or null to reject. */
export function sniffImageMime(buffer: Buffer): string | null {
	const t = detectFileType(buffer);
	if (t === null || !ALLOWED_IMAGE.has(t)) return null;
	return MIME_BY_TYPE[t] ?? null;
}

/** Sniffed document MIME (an allowed image OR a PDF), or null to reject. */
export function sniffDocumentMime(buffer: Buffer): string | null {
	const t = detectFileType(buffer);
	if (t === null) return null;
	if (t === "pdf" || ALLOWED_IMAGE.has(t)) return MIME_BY_TYPE[t] ?? null;
	return null;
}
