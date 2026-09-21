export function displayDate(value, fallback = "Not available") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  // Calendar dates are not instants: preserve their day in every timezone.
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? date.toLocaleDateString(undefined, { timeZone: "UTC" })
    : date.toLocaleDateString();
}
