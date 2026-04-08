import { ADMIN_HOSTNAME, isAdminPath, normalizeHostname } from "./hosts";

type LocationLike = Pick<Location, "hostname" | "pathname">;

export function shouldRegisterPublicPwa(location: LocationLike): boolean {
  return normalizeHostname(location.hostname) !== ADMIN_HOSTNAME && !isAdminPath(location.pathname);
}

export function shouldRegisterAdminPwa(location: LocationLike): boolean {
  return normalizeHostname(location.hostname) === ADMIN_HOSTNAME && isAdminPath(location.pathname);
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
