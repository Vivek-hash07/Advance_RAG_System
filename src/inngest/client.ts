import { Inngest } from "inngest";

/**
 * Shared Inngest client.
 *
 * Cached on `globalThis` so Next.js hot reloads in development reuse one client
 * rather than opening a new connection on every module re-evaluation.
 */
const globalForInngest = globalThis as unknown as {
  inngest: Inngest | undefined;
};

export const inngest =
  globalForInngest.inngest ?? new Inngest({ id: "rag-system" });

if (process.env.NODE_ENV !== "production") {
  globalForInngest.inngest = inngest;
}
