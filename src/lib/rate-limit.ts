/**
 * Minimal in-process sliding-window limiter. Used to bound operations that cost
 * the operator real money or real I/O per call. The app ships without auth, so
 * anything reachable from the network must carry its own ceiling; a single-user,
 * single-process deployment needs nothing distributed.
 */

export interface RateDecision {
	ok: boolean;
	/** Seconds until the window frees a slot (only meaningful when !ok). */
	retryAfterSec: number;
	remaining: number;
}

export interface RateLimiter {
	/** Consume one slot if the window allows it. */
	take(): RateDecision;
}

export function createRateLimiter(
	limit: number,
	windowMs: number,
	now: () => number = Date.now,
): RateLimiter {
	const hits: number[] = [];

	return {
		take(): RateDecision {
			const t = now();
			const cutoff = t - windowMs;
			while (hits.length > 0 && hits[0]! <= cutoff) hits.shift();

			if (limit <= 0 || hits.length >= limit) {
				const oldest = hits[0] ?? t;
				return {
					ok: false,
					retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - t) / 1000)),
					remaining: 0,
				};
			}

			hits.push(t);
			return { ok: true, retryAfterSec: 0, remaining: limit - hits.length };
		},
	};
}
