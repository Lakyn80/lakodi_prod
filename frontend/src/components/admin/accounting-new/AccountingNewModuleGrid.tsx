import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccountingNewModuleDefinition } from "@/types/accountingNew";

export function AccountingNewModuleGrid({
  modules,
}: {
  modules: AccountingNewModuleDefinition[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {modules.map((module) => (
        <Card key={module.id} id={module.id} className="border-border bg-card">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-lg">{module.title}</CardTitle>
            </div>
            <Badge variant="secondary">Připraveno</Badge>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{module.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
