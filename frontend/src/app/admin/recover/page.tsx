"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { adminApiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminRecoverPage() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!token) {
      setError("Neplatný odkaz pro obnovu hesla.");
      return;
    }
    if (password.length < 8) {
      setError("Heslo musí mít alespoň 8 znaků.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("Hesla se neshodují.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(adminApiUrl("/recover/reset"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail || "Obnova hesla se nepodařila.");
        return;
      }
      setPassword("");
      setPasswordConfirm("");
      setSuccess("Heslo bylo úspěšně změněno. Můžete se přihlásit.");
    } catch {
      setError("Chyba připojení.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-24">
      <div className="mx-auto max-w-sm rounded-2xl border border-border bg-card p-8">
        <h1 className="mb-6 text-xl font-bold text-foreground">Obnova hesla administrace</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Nové heslo</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-background"
              placeholder="••••••••"
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password-confirm">Potvrzení hesla</Label>
            <Input
              id="password-confirm"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className="bg-background"
              placeholder="••••••••"
              required
              minLength={8}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-green-600 dark:text-green-400">{success}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Ukládám…" : "Nastavit nové heslo"}
          </Button>
          <div className="pt-2 text-center">
            <Link href="/admin/login" className="text-xs text-muted-foreground underline hover:text-foreground">
              Zpět na přihlášení
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
