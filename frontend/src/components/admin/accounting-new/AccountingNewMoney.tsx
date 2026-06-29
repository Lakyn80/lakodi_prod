export function AccountingNewMoney({
  amount,
  currency,
  className,
}: {
  amount: number;
  currency: string;
  className?: string;
}) {
  const normalizedCurrency = currency.trim().toUpperCase();
  const formatter =
    normalizedCurrency.length >= 3
      ? new Intl.NumberFormat("cs-CZ", {
          style: "currency",
          currency: normalizedCurrency,
          maximumFractionDigits: 2,
        })
      : new Intl.NumberFormat("cs-CZ", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  const text =
    normalizedCurrency.length >= 3
      ? formatter.format(amount)
      : `${formatter.format(amount)} ${currency}`.trim();

  return <span className={className}>{text}</span>;
}
