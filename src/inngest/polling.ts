/**
 * PageIndex tree generation is asynchronous and its duration scales with the
 * document, so runs poll on a backing-off schedule rather than a fixed tick:
 * quick checks catch short documents in seconds, and the widening gaps keep a
 * long book from costing hundreds of polls.
 */
const DELAYS_SECONDS = [
  5, 10, 15, 20, 30, 30, 45, 60, 60, 60, 90, 90, 120, 120, 120, 180, 180, 180,
  240, 240,
];

export const MAX_POLL_ATTEMPTS = DELAYS_SECONDS.length;

/** Total wait before a run gives up, for the timeout message. */
export const POLL_BUDGET_MINUTES = Math.round(
  DELAYS_SECONDS.reduce((total, seconds) => total + seconds, 0) / 60,
);

export function pollDelay(attempt: number): string {
  const seconds =
    DELAYS_SECONDS[Math.min(attempt, DELAYS_SECONDS.length - 1)];
  return `${seconds}s`;
}
