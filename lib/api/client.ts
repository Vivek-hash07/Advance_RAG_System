/** Error carrying the server's message and status so the UI can react to both. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string }
    if (body?.error) return body.error
  } catch {
    // Non-JSON error body; fall through to a generic message.
  }

  return `Request failed with status ${response.status}`
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, init)

  if (!response.ok) {
    throw new ApiError(await readError(response), response.status)
  }

  return (await response.json()) as T
}
