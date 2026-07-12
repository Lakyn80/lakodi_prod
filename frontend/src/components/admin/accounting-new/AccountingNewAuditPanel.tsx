"use client";

import { useEffect, useState } from "react";

import { useAccountingNewCollapsibleList } from "@/components/admin/accounting-new/useAccountingNewCollapsibleList";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { AccountingNewRequestError, listAccountingNewAuditEvents } from "@/lib/accountingNew";
import type { AccountingNewApiError, AccountingNewAuditEventSummary } from "@/types/accountingNew";
import {
  formatAccountingNewDateTime,
  formatAccountingNewTemplate,
  translateAccountingNewApiError,
  translateAccountingNewAuditEvent,
  translateAccountingNewAuditSource,
  translateAccountingNewEntityType,
} from "@/components/admin/accounting-new/accountingNewFormat";

export function AccountingNewAuditPanel({ defaultExpanded = false }: { defaultExpanded?: boolean } = {}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew;
  const { expanded, toggle, isContentVisible } = useAccountingNewCollapsibleList(defaultExpanded);
  const [events, setEvents] = useState<AccountingNewAuditEventSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AccountingNewApiError | null>(null);
  const authRequired = Boolean(error?.requiresLogin);
  const contentVisible = isContentVisible(authRequired, error && !authRequired ? error : null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadEvents() {
      setIsLoading(true);
      setError(null);

      try {
        const loaded = await listAccountingNewAuditEvents({ signal: controller.signal });
        setEvents(loaded.slice(0, 25));
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof AccountingNewRequestError
            ? loadError.apiError
            : {
                resource: "audit-events",
                message: loadError instanceof Error ? loadError.message : t.errors.actionFailed,
                status: null,
                requiresLogin: false,
              },
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadEvents();
    return () => controller.abort();
  }, [t.errors.actionFailed]);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={toggle}>
            {expanded ? t.auditPanel.hideList : t.auditPanel.showList}
          </Button>
        </div>
        <div className="space-y-1">
          <CardTitle>{t.auditPanel.title}</CardTitle>
          <CardDescription>{t.auditPanel.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {formatAccountingNewTemplate(t.auditPanel.listCollapsed, { count: events.length })}
        </p>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{t.errors.supplementalTitle}</AlertTitle>
            <AlertDescription>{translateAccountingNewApiError(t, error)}</AlertDescription>
          </Alert>
        ) : null}

        {contentVisible && isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : null}

        {contentVisible && !isLoading && events.length > 0 ? (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{translateAccountingNewEntityType(t, event.entityType)}</Badge>
                  <Badge variant="secondary">{translateAccountingNewAuditEvent(t, event.eventType)}</Badge>
                  <Badge variant="outline">{translateAccountingNewAuditSource(t, event.source)}</Badge>
                </div>
                <p className="mt-3 text-sm text-foreground">{event.message ?? t.common.noAuditMessage}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatAccountingNewDateTime(event.createdAt, language, t.common.noValue)}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {contentVisible && !isLoading && events.length === 0 && !error ? (
          <p className="text-sm text-muted-foreground">{t.empty.dashboardAudit}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
