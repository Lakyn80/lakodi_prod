"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { accountingNewHashRedirects } from "@/lib/accountingNewModuleRoutes";

export function AccountingNewHashRedirect() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) {
      return;
    }

    const target = accountingNewHashRedirects[hash];
    if (target) {
      router.replace(target);
    }
  }, [router]);

  return null;
}
