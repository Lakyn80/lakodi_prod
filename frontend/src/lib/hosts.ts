export const CANONICAL_HOSTNAME = "lakodi.cz";
export const WWW_HOSTNAME = `www.${CANONICAL_HOSTNAME}`;
export const ADMIN_HOSTNAME = `admin.${CANONICAL_HOSTNAME}`;
export const CANONICAL_HOST = `https://${CANONICAL_HOSTNAME}`;

export function normalizeHostname(host: string): string {
  return host.split(":")[0].toLowerCase();
}

export function isAdminHostname(host: string): boolean {
  return normalizeHostname(host) === ADMIN_HOSTNAME;
}

export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function getDesktopHomeHrefForHostname(host: string): string {
  if (isAdminHostname(host)) {
    return CANONICAL_HOST;
  }
  return "/";
}
