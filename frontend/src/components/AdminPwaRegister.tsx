"use client";

import { useEffect } from "react";
import { disableAppPwa, shouldRegisterAdminPwa, unregisterServiceWorkers } from "@/lib/pwa";

export default function AdminPwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    let hasReloadedAfterUpdate = false;

    const registerServiceWorker = async () => {
      const currentLocation = window.location;

      if (!shouldRegisterAdminPwa(currentLocation)) {
        await disableAppPwa();
        return;
      }

      try {
        await unregisterServiceWorkers((scopePathname) => scopePathname === "/");
        const registration = await navigator.serviceWorker.register("/admin/sw.js", {
          scope: "/admin/",
        });
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
        // Záměrně bez hlášky. Registrace admin PWA nesmí rozbít běžný provoz.
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
