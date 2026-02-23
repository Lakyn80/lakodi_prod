export const CANONICAL_HOST = "https://lakodi.cz";

export function toCanonicalUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${CANONICAL_HOST}${normalizedPath}`;
}
