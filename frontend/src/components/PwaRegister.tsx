"use client";

import { useEffect } from "react";
import { ADMIN_HOSTNAME, normalizeHostname } from "@/lib/hosts";
import { shouldRegisterPublicPwa, unregisterServiceWorkers } from "@/lib/pwa";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    let hasReloadedAfterUpdate = false;

    const registerServiceWorker = async () => {
      const currentLocation = window.location;

      if (!shouldRegisterPublicPwa(currentLocation)) {
        if (normalizeHostname(currentLocation.hostname) === ADMIN_HOSTNAME) {
          await unregisterServiceWorkers((scopePathname) => scopePathname === "/");
        }
        return;
      }

      try {
        await unregisterServiceWorkers((scopePathname) => scopePathname.startsWith("/admin/"));
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await registration.update();

        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) {
            return;
          }

          installingWorker.addEventListener("statechange", () => {
            if (
              installingWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              registration.waiting?.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      } catch {
        // Záměrně bez hlášky. Registrace PWA nesmí rozbít běžný provoz aplikace.
      }
    };

    const handleControllerChange = () => {
      if (hasReloadedAfterUpdate) {
        return;
      }
      hasReloadedAfterUpdate = true;
      window.location.reload();
    };

    window.addEventListener("load", registerServiceWorker);
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    if (document.readyState === "complete") {
      void registerServiceWorker();
    }

    return () => {
      window.removeEventListener("load", registerServiceWorker);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  return null;
}
