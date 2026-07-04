"use client";

import { Search } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { translations } from "@/data/translations";
import { useLanguage } from "@/contexts/LanguageContext";
import { AccountingNewRequestError } from "@/lib/accountingNew";
import type { AccountingNewAresCompanyLookup } from "@/lib/accountingNewAres";
import {
  buildAccountingNewAresAddress,
  formatAccountingNewAresSource,
  getAccountingNewAresResultLabel,
  lookupAccountingNewAresCompany,
  searchAccountingNewAresCompanies,
} from "@/lib/accountingNewAres";

export interface AccountingNewAresFieldValues {
  name: string;
  email: string;
  phone: string;
  address: string;
  ico: string;
  dic: string;
  dataBox: string;
  country: string;
}

export function AccountingNewAresLookupSection({
  values,
  onChange,
  emailRequired = true,
}: {
  values: AccountingNewAresFieldValues;
  onChange: (patch: Partial<AccountingNewAresFieldValues>) => void;
  emailRequired?: boolean;
}) {
  const { language } = useLanguage();
  const t = translations[language].accountingNew.aresWrite;
  const [companySearchName, setCompanySearchName] = useState("");
  const [companySearchResults, setCompanySearchResults] = useState<AccountingNewAresCompanyLookup[]>([]);
  const [companySearchLoading, setCompanySearchLoading] = useState(false);
  const [companySearchMessage, setCompanySearchMessage] = useState("");
  const [aresLoading, setAresLoading] = useState(false);
  const [aresMessage, setAresMessage] = useState("");

  function applyAresCompany(company: AccountingNewAresCompanyLookup) {
    onChange({
      ico: company.ico,
      name: company.company_name,
      address: buildAccountingNewAresAddress(company.address_line, company.zip, company.city, company.country),
      dic: company.dic ?? values.dic,
      dataBox: company.data_box ?? values.dataBox,
      country: company.country || values.country,
    });
    setCompanySearchResults([]);
    setCompanySearchMessage(t.appliedFromSource.replace("{source}", formatAccountingNewAresSource(company.source)));
  }

  async function handleAresLookup() {
    setAresMessage("");
    const ico = values.ico.trim();
    if (!ico) {
      setAresMessage(t.icoRequired);
      return;
    }

    setAresLoading(true);
    try {
      const company = await lookupAccountingNewAresCompany(ico);
      applyAresCompany(company);
      setAresMessage(t.loadedFromSource.replace("{source}", formatAccountingNewAresSource(company.source)));
    } catch (error) {
      setAresMessage(error instanceof AccountingNewRequestError ? error.apiError.message : t.lookupFailed);
    } finally {
      setAresLoading(false);
    }
  }

  async function handleCompanySearch() {
    setCompanySearchMessage("");
    setCompanySearchResults([]);
    const query = companySearchName.trim();
    if (query.length < 2) {
      setCompanySearchMessage(t.searchMinLength);
      return;
    }

    setCompanySearchLoading(true);
    try {
      const results = await searchAccountingNewAresCompanies(query);
      setCompanySearchResults(results);
      if (results.length === 0) {
        setCompanySearchMessage(t.searchEmpty);
      } else if (results.length === 1) {
        applyAresCompany(results[0]);
        setCompanySearchMessage(t.searchSingleApplied.replace("{source}", formatAccountingNewAresSource(results[0].source)));
      } else {
        setCompanySearchMessage(t.searchMultiple.replace("{count}", String(results.length)));
      }
    } catch (error) {
      setCompanySearchMessage(error instanceof AccountingNewRequestError ? error.apiError.message : t.searchFailed);
    } finally {
      setCompanySearchLoading(false);
    }
  }

  function handleSearchKeyDown(event: React.KeyboardEvent, action: () => void) {
    if (event.key === "Enter") {
      event.preventDefault();
      void action();
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="aresCompanySearch">{t.searchByName}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="aresCompanySearch"
            value={companySearchName}
            onChange={(event) => setCompanySearchName(event.target.value)}
            onKeyDown={(event) => handleSearchKeyDown(event, handleCompanySearch)}
            placeholder={t.searchPlaceholder}
          />
          <Button type="button" variant="secondary" onClick={() => void handleCompanySearch()} disabled={companySearchLoading}>
            <Search className="h-4 w-4" />
            {companySearchLoading ? t.searchLoading : t.searchAction}
          </Button>
        </div>
        {companySearchMessage ? <p className="text-xs text-muted-foreground">{companySearchMessage}</p> : null}
        {companySearchResults.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-border bg-background p-3">
            {companySearchResults.map((company) => (
              <button
                key={`${company.ico}-${company.company_name}`}
                type="button"
                className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:border-primary/50"
                onClick={() => applyAresCompany(company)}
              >
                <p className="font-medium text-foreground">{getAccountingNewAresResultLabel(company)}</p>
                <p className="text-muted-foreground">
                  {buildAccountingNewAresAddress(company.address_line, company.zip, company.city, company.country)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.sourceLabel}: {formatAccountingNewAresSource(company.source)}
                </p>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="aresIco">{t.ico}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="aresIco"
            value={values.ico}
            onChange={(event) => onChange({ ico: event.target.value })}
            onKeyDown={(event) => handleSearchKeyDown(event, handleAresLookup)}
            placeholder={t.icoPlaceholder}
          />
          <Button type="button" variant="secondary" onClick={() => void handleAresLookup()} disabled={aresLoading}>
            <Search className="h-4 w-4" />
            {aresLoading ? t.lookupLoading : t.lookupAction}
          </Button>
        </div>
        {aresMessage ? <p className="text-xs text-muted-foreground">{aresMessage}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="aresDic">{t.dic}</Label>
        <Input id="aresDic" value={values.dic} onChange={(event) => onChange({ dic: event.target.value })} placeholder={t.dicPlaceholder} />
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="aresName">{t.name}</Label>
        <Input
          id="aresName"
          value={values.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder={t.namePlaceholder}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="aresEmail">{t.email}</Label>
        <Input
          id="aresEmail"
          type="email"
          value={values.email}
          onChange={(event) => onChange({ email: event.target.value })}
          placeholder={t.emailPlaceholder}
          required={emailRequired}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="aresPhone">{t.phone}</Label>
        <Input id="aresPhone" value={values.phone} onChange={(event) => onChange({ phone: event.target.value })} placeholder={t.phonePlaceholder} />
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="aresAddress">{t.address}</Label>
        <Input
          id="aresAddress"
          value={values.address}
          onChange={(event) => onChange({ address: event.target.value })}
          placeholder={t.addressPlaceholder}
          required
        />
      </div>
    </div>
  );
}
