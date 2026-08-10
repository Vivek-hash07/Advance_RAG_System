/**
 * Phase 0 readiness check — local stack prerequisites, not a full UI smoke.
 *
 *   npm run verify:phase0
 *
 * Exit 0 means: DB schema is current, env keys needed for ask/ingest are set,
 * and `/api/inngest` reports the expected function count. It does not upload
 * files or ask questions (those need a signed-in browser + Inngest CLI running).
 */
import { prisma } from "../src/lib/db.ts";

const APP_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const EXPECTED_FUNCTIONS = 6;

type Check = { name: string; ok: boolean; detail: string };

function requireEnv(name: string): Check {
  const value = process.env[name];
  if (!value || !value.trim()) {
    return { name, ok: false, detail: "missing or empty" };
  }
  if (value.includes(" #") || value.trim().includes(" ")) {
    // URLs with trailing comments break Better Auth origin checks.
    if (name.endsWith("_URL") && /\s#/.test(value)) {
      return {
        name,
        ok: false,
        detail: "contains an inline # comment — put comments on their own line",
      };
    }
  }
  return { name, ok: true, detail: `set (len ${value.length})` };
}

async function checkSourceUrlColumn(): Promise<Check> {
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'document' AND column_name = 'sourceUrl'`,
  );
  return {
    name: "document.sourceUrl column",
    ok: rows.length === 1,
    detail: rows.length === 1 ? "present" : "missing — run npm run db:deploy",
  };
}

async function checkPrismaClient(): Promise<Check> {
  try {
    await prisma.document.findMany({
      take: 1,
      select: { id: true, sourceUrl: true, status: true, name: true },
    });
    return {
      name: "Prisma client sourceUrl select",
      ok: true,
      detail: "ok",
    };
  } catch (error) {
    return {
      name: "Prisma client sourceUrl select",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkInngestRoute(): Promise<Check> {
  try {
    const response = await fetch(`${APP_URL.replace(/\/$/, "")}/api/inngest`);
    if (!response.ok) {
      return {
        name: "/api/inngest",
        ok: false,
        detail: `HTTP ${response.status} — is Next running on ${APP_URL}?`,
      };
    }
    const body = (await response.json()) as {
      function_count?: number;
      mode?: string;
    };
    const count = body.function_count ?? -1;
    return {
      name: "/api/inngest",
      ok: count === EXPECTED_FUNCTIONS,
      detail: `function_count=${count} mode=${body.mode ?? "?"} (want ${EXPECTED_FUNCTIONS})`,
    };
  } catch (error) {
    return {
      name: "/api/inngest",
      ok: false,
      detail:
        error instanceof Error
          ? `${error.message} — start Next with npm run dev`
          : String(error),
    };
  }
}

async function main() {
  const checks: Check[] = [
    requireEnv("DATABASE_URL"),
    requireEnv("BETTER_AUTH_SECRET"),
    requireEnv("BETTER_AUTH_URL"),
    requireEnv("NEXT_PUBLIC_BETTER_AUTH_URL"),
    requireEnv("PAGEINDEX_API_KEY"),
    requireEnv("OPENAI_API_KEY"),
    requireEnv("YOUTUBE_API_KEY"),
    requireEnv("INNGEST_DEV"),
  ];

  checks.push(await checkSourceUrlColumn());
  checks.push(await checkPrismaClient());
  checks.push(await checkInngestRoute());

  let failed = 0;
  console.log("Phase 0 verify\n");
  for (const check of checks) {
    const mark = check.ok ? "PASS" : "FAIL";
    if (!check.ok) failed += 1;
    console.log(`[${mark}] ${check.name}: ${check.detail}`);
  }

  console.log(
    failed === 0
      ? "\nAll automated Phase 0 checks passed.\nNext: keep `npm run dev` + `npm run inngest` up, then smoke PDF / YouTube / playlist in the dashboard."
      : `\n${failed} check(s) failed. Fix the FAIL lines above before Phase 1.`,
  );

  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
