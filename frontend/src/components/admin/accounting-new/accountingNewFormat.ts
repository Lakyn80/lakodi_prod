export function formatAccountingNewDate(value: string | null): string {
  if (!value) {
    return "Neuvedeno";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" }).format(date);
}

export function formatAccountingNewDateTime(value: string | null): string {
  if (!value) {
    return "Neuvedeno";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
