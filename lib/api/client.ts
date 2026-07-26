/** Error carrying the server's message, status and body so the UI can react. */
export class ApiError<TBody = unknown> extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The parsed error body, for responses that offer the caller a choice. */
    readonly body?: TBody,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function readError(
  response: Response,
): Promise<{ message: string; body: unknown }> {
  try {
    const body = (await response.json()) as { error?: string }
    if (body?.error) return { message: body.error, body }
  } catch {
    // Non-JSON error body; fall through to a generic message.
  }

  return {
    message: `Request failed with status ${response.status}`,
    body: undefined,
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, init)

  if (!response.ok) {
    const { message, body } = await readError(response)
    throw new ApiError(message, response.status, body)
  }

  return (await response.json()) as T
}
