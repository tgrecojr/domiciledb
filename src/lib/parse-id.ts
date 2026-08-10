/**
 * Parse a form/query identifier into a positive integer id, or null if it is
 * absent or malformed. NEVER coerce: Number(null)/Number("")/Number("  ") all
 * become 0, which passes Number.isInteger and would let an absent id proceed as
 * item 0 (writing attacker bytes under .../0/ before an FK-failing insert whose
 * error is swallowed). Require an explicit run of digits and reject zero.
 */
export function parseId(value: unknown): number | null {
	if (typeof value !== "string") return null;
	const s = value.trim();
	if (!/^\d+$/.test(s)) return null;
	const n = Number(s);
	return Number.isSafeInteger(n) && n > 0 ? n : null;
}
