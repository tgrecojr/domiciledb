/**
 * Guards for expensive, unauthenticated-reachable operations (full db VACUUM,
 * whole-tree zip, S3 backup). The app has no auth by design, so a caller can
 * fire these back-to-back; without a gate each request multiplies disk, CPU and
 * egress. Pure + in-process — a single-user, single-process deployment needs no
 * distributed lock.
 */

export interface GateAdmission {
  ok: boolean;
  /** Seconds the caller should wait before retrying (only when `ok` is false). */
  retryAfterSec: number;
  reason?: "in-flight" | "too-soon";
}

export interface SingleFlightGate {
  /**
   * Synchronously claim the gate. Must be called before the first `await` of
   * the handler, otherwise two requests can both pass the check.
   */
  tryEnter(): GateAdmission;
  /**
   * Release the claim. `completed` records the finish time so the minimum
   * interval starts counting; pass false when the run did no real work.
   */
  release(completed?: boolean): void;
  readonly inFlight: boolean;
}

export function createSingleFlightGate(
  minIntervalMs: number,
  now: () => number = Date.now,
): SingleFlightGate {
  let running = false;
  let lastFinishedAt = Number.NEGATIVE_INFINITY;

  return {
    tryEnter(): GateAdmission {
      if (running) {
        return {
          ok: false,
          retryAfterSec: Math.max(1, Math.ceil(minIntervalMs / 1000)),
          reason: "in-flight",
        };
      }
      const waited = now() - lastFinishedAt;
      if (waited < minIntervalMs) {
        return {
          ok: false,
          retryAfterSec: Math.max(
            1,
            Math.ceil((minIntervalMs - waited) / 1000),
          ),
          reason: "too-soon",
        };
      }
      running = true;
      return { ok: true, retryAfterSec: 0 };
    },
    release(completed = true) {
      running = false;
      if (completed) lastFinishedAt = now();
    },
    get inFlight() {
      return running;
    },
  };
}

/**
 * Wrap an async operation so overlapping callers JOIN the run already in
 * flight instead of starting another. Used where a second concurrent run would
 * duplicate remote work (S3 PUT/LIST + egress) and race on shared files.
 */
export function singleFlight<A extends unknown[], T>(
  fn: (...args: A) => Promise<T>,
): (...args: A) => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return (...args: A): Promise<T> => {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        return await fn(...args);
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}
