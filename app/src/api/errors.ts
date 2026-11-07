/** An error response from the API, with a message safe to show the user. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The request never got a response (offline, DNS, timeout). */
export class NetworkError extends Error {
  constructor() {
    super("Can't reach the server. Check your connection and try again.");
    this.name = 'NetworkError';
  }
}

/** The session is gone (refresh token expired or revoked): sign in again. */
export class SignedOutError extends Error {
  constructor() {
    super('Your session ended. Please sign in again.');
    this.name = 'SignedOutError';
  }
}

const FALLBACK: Record<number, string> = {
  401: 'Email or password is incorrect.',
  404: 'That item no longer exists.',
  429: 'Too many attempts. Wait a few minutes and try again.',
};

/** FastAPI sends `{detail: string}` or, for validation errors, `{detail: [{msg}]}`. */
export function messageFrom(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string' && detail.length > 0) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: unknown; loc?: unknown };
    const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : undefined;
    if (typeof first.msg === 'string') {
      return typeof field === 'string' ? `${field.replace(/_/g, ' ')}: ${first.msg}` : first.msg;
    }
  }
  return FALLBACK[status] ?? `Something went wrong (${status}). Try again.`;
}
