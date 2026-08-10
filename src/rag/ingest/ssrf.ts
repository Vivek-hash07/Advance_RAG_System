import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
]);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // ULA
  if (normalized.startsWith("fe80")) return true; // link-local
  // IPv4-mapped IPv6
  if (normalized.includes(".")) {
    const mapped = normalized.split(":").pop() ?? "";
    if (isIP(mapped) === 4) return isPrivateIpv4(mapped);
  }
  return false;
}

function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return true;
}

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

/**
 * Validate a user-supplied URL before any fetch.
 *
 * Only public http(s) hosts are allowed. Private, loopback, link-local and
 * cloud-metadata addresses are rejected after DNS resolution so DNS rebinding
 * to 127.0.0.1 cannot sneak through.
 */
export async function assertSafePublicUrl(raw: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new SsrfError("That does not look like a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfError("Only http and https webpage URLs are supported.");
  }

  if (parsed.username || parsed.password) {
    throw new SsrfError("URLs with embedded credentials are not allowed.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    !hostname ||
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost")
  ) {
    throw new SsrfError("That host is not allowed.");
  }

  // Literal IP in the URL.
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new SsrfError("Private or local network addresses are not allowed.");
    }
    return parsed;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SsrfError(`Could not resolve host "${hostname}".`);
  }

  if (addresses.length === 0) {
    throw new SsrfError(`Could not resolve host "${hostname}".`);
  }

  for (const entry of addresses) {
    if (isBlockedIp(entry.address)) {
      throw new SsrfError(
        "That hostname resolves to a private or local address and cannot be fetched.",
      );
    }
  }

  return parsed;
}
