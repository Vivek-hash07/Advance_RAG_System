import { headers } from "next/headers";

import { auth } from "@/src/lib/auth";

export class UnauthorizedError extends Error {
  constructor() {
    super("You must be signed in to do that.");
    this.name = "UnauthorizedError";
  }
}

/** Resolve the signed-in user for a route handler, or throw. */
export async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }

  return session.user.id;
}
