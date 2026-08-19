export function money(n: number): string {
  return "RM " + Number(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function shortMoney(n: number): string {
  if (n >= 1_000_000) return "RM " + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "RM " + (n / 1_000).toFixed(0) + "K";
  return money(n);
}
