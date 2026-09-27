/** A failure a person can act on. `code` maps to an HTTP status in the API and to a toast in the app. */
export class ServiceError extends Error {
  constructor(readonly code: "invalid" | "not_found" | "conflict" | "limit" | "forbidden", message: string) { super(message); }
}
export const STATUS: Record<ServiceError["code"], number> = { invalid: 422, not_found: 404, conflict: 409, limit: 429, forbidden: 403 };
