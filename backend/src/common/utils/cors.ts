/**
 * Parse CORS_ORIGIN into what @nestjs/platform-* and socket.io expect:
 *   unset          → the local dev frontend (safe default)
 *   "*"            → true = reflect ANY origin (demo/tunnel convenience)
 *   "a,b,c"        → an allow-list array
 *   "https://x"    → that single origin
 *
 * Reflecting (true) is used instead of the literal "*" so it stays compatible
 * with credentialed requests, which browsers reject against a wildcard string.
 */
export function parseCorsOrigin(
  value = process.env.CORS_ORIGIN,
): boolean | string | string[] {
  if (value === '*') return true;
  if (value && value.includes(',')) return value.split(',').map((s) => s.trim());
  return value || 'http://localhost:5173';
}
