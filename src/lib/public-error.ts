/**
 * Prisma and the bundler attach the full query invocation to Error.message,
 * including a Turbopack module path with no spaces. That string is not
 * something to show in the product, and it blows out any layout that does
 * not force a break.
 */
const ENGINE_DUMP =
  /Invalid `|__TURBOPACK__|Transaction API error|expired transaction|\bP20\d{2}\b/i;

const TRANSACTION_TIMEOUT =
  /expired transaction|Transaction API error|\bP2028\b/i;

export function sanitizeStoredError(
  message: string | null | undefined,
  fallback: string,
): string | null {
  const raw = message?.trim() ?? "";
  if (!raw) return null;
  if (TRANSACTION_TIMEOUT.test(raw)) {
    return "Saving this took too long. Try adding it again.";
  }
  if (ENGINE_DUMP.test(raw) || raw.length > 280) return fallback;
  return raw;
}

export function describePublicError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : "";
  return sanitizeStoredError(raw, fallback) ?? fallback;
}
