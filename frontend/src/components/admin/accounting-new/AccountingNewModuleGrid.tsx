import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccountingNewModuleDefinition, AccountingNewModuleId } from "@/types/accountingNew";

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
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {modules.map((module) => (
        <Card key={module.id} id={module.id} className="border-border bg-card">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-lg">{module.title}</CardTitle>
            </div>
            <Badge variant={module.availability === "read-only" ? "secondary" : "outline"}>
              {stats[module.id]?.badge ?? (module.availability === "read-only" ? labels.readOnly : labels.ready)}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{module.description}</p>
            <p className="text-sm text-foreground">{stats[module.id]?.detail ?? labels.noMetrics}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
