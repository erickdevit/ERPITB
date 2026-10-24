import { AppError } from './http';

/**
 * Extracts version number from ETag or If-Match header (e.g. W/"3", "3", 3)
 */
export function parseIfMatchHeader(request: Request): number | null {
  const header = request.headers.get('if-match');
  if (!header) return null;
  const cleaned = header.replace(/^[Ww]\//, '').replace(/"/g, '').trim();
  const num = parseInt(cleaned, 10);
  return Number.isNaN(num) ? null : num;
}

/**
 * Formats ETag header value: W/"<version>"
 */
export function formatETag(version: number | string): string {
  return `W/"${version}"`;
}

/**
 * Verifies optimistic concurrency against current version in database.
 * Throws AppError(409, ...) with code 'CONCURRENCY_CONFLICT' if mismatch occurs.
 */
export function assertConcurrencyVersion(currentVersion: number, ifMatchVersion: number | null): void {
  if (ifMatchVersion !== null && currentVersion !== ifMatchVersion) {
    throw new AppError(
      409,
      'Registro foi modificado concorrentemente por outro usuário.',
      'CONCURRENCY_CONFLICT',
      { serverVersion: currentVersion, currentVersion, submittedVersion: ifMatchVersion }
    );
  }
}
