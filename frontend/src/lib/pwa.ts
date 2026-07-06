import { ADMIN_HOSTNAME, isAdminPath, normalizeHostname } from "./hosts";

type LocationLike = Pick<Location, "hostname" | "pathname">;
const isProductionBuild = process.env.NODE_ENV === "production";
const APP_CACHE_PREFIXES = ["lakodi-shell-", "lakodi-admin-shell-"];

export function shouldRegisterPublicPwa(location: LocationLike): boolean {
  return isProductionBuild && normalizeHostname(location.hostname) !== ADMIN_HOSTNAME && !isAdminPath(location.pathname);
}

export function shouldRegisterAdminPwa(location: LocationLike): boolean {
  return isProductionBuild && normalizeHostname(location.hostname) === ADMIN_HOSTNAME && isAdminPath(location.pathname);
}

export async function unregisterServiceWorkers(
  predicate: (scopePathname: string) => boolean,
): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations.map((registration) => {
      try {
        const scopePathname = new URL(registration.scope).pathname;
        if (!predicate(scopePathname)) {
          return Promise.resolve(false);
        }
        return registration.unregister();
      } catch {
        return Promise.resolve(false);
      }
    }),
  );
}

export async function clearAppCaches(): Promise<void> {
  if (typeof caches === "undefined") {
    return;
  }

  const cacheKeys = await caches.keys();
  await Promise.all(
    cacheKeys.map((cacheKey) => {
      if (!APP_CACHE_PREFIXES.some((prefix) => cacheKey.startsWith(prefix))) {
        return Promise.resolve(false);
      }
      return caches.delete(cacheKey);
    }),
  );
}

export async function disableAppPwa(): Promise<void> {
  await unregisterServiceWorkers(
    (scopePathname) => scopePathname === "/" || scopePathname.startsWith("/admin/"),
  );
  await clearAppCaches();
}
