import { CANONICAL_HOST } from "./hosts";
export { CANONICAL_HOST } from "./hosts";

export function toCanonicalUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${CANONICAL_HOST}${normalizedPath}`;
}
