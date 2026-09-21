/** Serialize multi-ticker filters without ever turning an empty list into a market scan. */
export function tickerCSV(
  value: string | readonly string[],
  maxLength: number,
  maxCount?: number,
): string {
  const symbols = new Set<string>();
  for (const item of typeof value === "string" ? [value] : value) {
    if (typeof item !== "string") throw new TypeError("tickers must contain strings");
    for (const part of item.split(",")) {
      const symbol = part.trim().toUpperCase();
      if (!symbol || symbol.length > maxLength) {
        throw new RangeError(`Each ticker must have 1–${maxLength} characters`);
      }
      symbols.add(symbol);
    }
  }
  if (!symbols.size || (maxCount !== undefined && symbols.size > maxCount)) {
    throw new RangeError(
      maxCount
        ? "tickers must contain 1–100 distinct symbols"
        : "tickers must not be empty; omit the filter to scan the market",
    );
  }
  return [...symbols].join(",");
}

export function integerRange(name: string, value: number | undefined, low: number, high?: number) {
  if (
    value !== undefined &&
    (!Number.isInteger(value) || value < low || (high !== undefined && value > high))
  ) {
    throw new RangeError(`${name} must be an integer >= ${low}${high ? ` and <= ${high}` : ""}`);
  }
}
