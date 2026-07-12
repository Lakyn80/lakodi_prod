"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccountingNewModuleDefinition, AccountingNewModuleId } from "@/types/accountingNew";
import { getAccountingNewModuleRoute } from "@/lib/accountingNewModuleRoutes";

export interface AccountingNewModuleStat {
  badge: string;
  detail: string;
}

export function AccountingNewModuleGrid({
  modules,
  stats = {},
  labels,
}: {
  modules: AccountingNewModuleDefinition[];
  stats?: Partial<Record<AccountingNewModuleId, AccountingNewModuleStat>>;
  labels: {
    readOnly: string;
    ready: string;
    noMetrics: string;
  };
}) {
  const navigableModules = modules.filter((module) => module.id !== "dashboard");

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {navigableModules.map((module) => (
        <Link
          key={module.id}
          href={getAccountingNewModuleRoute(module.id)}
          id={module.id}
          className="group block min-h-[44px] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Card className="h-full border-border bg-card transition-colors hover:border-primary/40 hover:bg-accent/30">
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-lg">{module.title}</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={module.availability === "read-only" ? "secondary" : "outline"}>
                  {stats[module.id]?.badge ?? (module.availability === "read-only" ? labels.readOnly : labels.ready)}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{module.description}</p>
              <p className="text-sm text-foreground">{stats[module.id]?.detail ?? labels.noMetrics}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
