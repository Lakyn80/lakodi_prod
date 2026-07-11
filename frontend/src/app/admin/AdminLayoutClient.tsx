"use client";

import { isAccountingNewEnabled } from "@/lib/accountingNewFeature";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { adminApiUrl, apiFetchOptions } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AdminPwaRegister from "@/components/AdminPwaRegister";

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await window.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function AdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [auth, setAuth] = useState<"checking" | "yes" | "no">("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<"success" | "error" | null>(null);
  const [recoveryError, setRecoveryError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const recoveryToken = params.get("recovery");
    if (recoveryToken) {
      fetch(adminApiUrl(`/recover?token=${encodeURIComponent(recoveryToken)}`), apiFetchOptions)
        .then((r) => {
          if (r.ok) return r.json();
          throw new Error("Invalid");
        })
        .then(() => {
          setAuth("yes");
          window.dispatchEvent(new Event("admin-auth-changed"));
          window.history.replaceState({}, "", "/admin/");
          router.replace("/admin/");
        })
        .catch(() => setAuth("no"));
      return;
    }
    fetch(adminApiUrl("/check"), apiFetchOptions)
      .then((r) => r.json())
      .then((d) => {
        const isAdmin = d.authenticated && d.role === "admin";
        setAuth(isAdmin ? "yes" : "no");
        if (isAdmin && pathname === "/admin/login") {
          router.replace("/admin/");
        }
        if (!isAdmin && pathname !== "/admin/login" && pathname !== "/admin/recover") {
          router.replace("/admin/login");
        }
      })
      .catch(() => setAuth("no"));
  }, [pathname, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const challengeRes = await fetch(adminApiUrl("/login-challenge"), {
        method: "GET",
        credentials: "include",
      });
      const challengeData = await challengeRes.json().catch(() => ({}));
      if (!challengeRes.ok || !challengeData.challenge_id || !challengeData.nonce) {
        throw new Error("Login challenge unavailable");
      }

      const passwordProof = await sha256Hex(`${password}:${challengeData.nonce}`);
      const res = await fetch(adminApiUrl("/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          challenge_id: challengeData.challenge_id,
          password_proof: passwordProof,
        }),
        credentials: "include",
      });
      if (res.ok) {
        setAuth("yes");
        window.dispatchEvent(new Event("admin-auth-changed"));
        router.push("/admin/");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "Nesprávný email nebo heslo");
      }
    } catch {
      setError("Chyba připojení");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch(adminApiUrl("/logout"), {
      method: "POST",
      credentials: "include",
    });
    setAuth("no");
    window.dispatchEvent(new Event("admin-auth-changed"));
    setEmail("");
    setPassword("");
    router.push("/admin/login");
  };

  const handleRequestRecovery = async () => {
    setRecoveryMessage(null);
    setRecoveryError("");
    setRecoveryLoading(true);
    try {
      const res = await fetch(adminApiUrl("/request-recovery"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: recoveryEmail }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRecoveryMessage("success");
        setRecoveryEmail("");
      } else {
        setRecoveryMessage("error");
        setRecoveryError(data.detail || "Nepodařilo se odeslat odkaz");
      }
    } catch {
      setRecoveryMessage("error");
      setRecoveryError("Chyba připojení");
    } finally {
      setRecoveryLoading(false);
    }
  };

  if (auth === "checking") {
    return (
      <div className="admin-pwa-wrapper">
        <AdminPwaRegister />
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-muted-foreground">Kontroluji přístup…</p>
        </div>
      </div>
    );
  }

  if (auth === "no") {
    if (pathname === "/admin/recover") {
      return (
        <div className="admin-pwa-wrapper">
          <AdminPwaRegister />
          {children}
        </div>
      );
    }
    return (
      <div className="admin-pwa-wrapper">
        <AdminPwaRegister />
        <div className="container mx-auto px-4 py-12 sm:py-24">
          <div className="mx-auto max-w-sm rounded-2xl border border-border bg-card p-6 sm:p-8">
            <h1 className="mb-6 text-xl font-bold text-foreground">Přihlášení do administrace</h1>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-background"
                  placeholder="admin@example.com"
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Heslo</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-background"
                  placeholder="••••••••"
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Ověřuji…" : "Přihlásit"}
              </Button>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowRecovery(!showRecovery);
                    if (!showRecovery) setError("");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Zapomněli jste heslo?
                </button>
                {showRecovery && (
                  <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                    <Label htmlFor="recovery-email">Váš email</Label>
                    {recoveryError && <p className="text-sm text-destructive">{recoveryError}</p>}
                    <Input
                      id="recovery-email"
                      type="email"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      placeholder="admin@example.com"
                      className="bg-background"
                      required
                    />
                    <Button type="button" variant="secondary" size="sm" disabled={recoveryLoading} onClick={handleRequestRecovery}>
                      {recoveryLoading ? "Odesílám…" : "Odeslat odkaz na email"}
                    </Button>
                    {recoveryMessage === "success" && (
                      <p className="text-sm text-green-600 dark:text-green-400">
                        Pokud je email zaregistrován, dostanete odkaz na přihlášení.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { href: "/admin/", label: "Zakázky" },
    { href: "/admin/invoices", label: "Faktury" },
    ...(isAccountingNewEnabled() ? [{ href: "/admin/ucetnictvi-new", label: "Účetnictví" }] : []),
    { href: "/admin/kalendar", label: "Kalendář" },
  ];

  return (
    <div className="admin-pwa-wrapper">
      <AdminPwaRegister />
      <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-8">
        <div className="mb-4 flex items-center justify-between gap-2 sm:mb-6">
          <h2 className="text-base font-medium text-muted-foreground sm:text-lg">Administrace</h2>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Odhlásit
          </Button>
        </div>
        <nav className="mb-4 flex flex-wrap gap-2 sm:mb-6">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href === "/admin/" && pathname === "/admin");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/40"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </div>
  );
}
