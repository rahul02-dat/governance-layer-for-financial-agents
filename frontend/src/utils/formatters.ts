/**
 * Currency-aware financial formatter using Intl.NumberFormat.
 * Respects ISO currency codes (INR, USD, EUR, etc.) and locale formatting.
 * Preserves exact numerical precision without arbitrary truncation or floating-point divisions.
 */
export function formatMoney(amount: number | null | undefined, currency: string = 'INR'): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '-';
  }

  const normalizedCurrency = (currency || 'INR').trim().toUpperCase();

  try {
    const locale = normalizedCurrency === 'INR' ? 'en-IN' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback for unrecognized currency codes
    return `${normalizedCurrency} ${amount.toFixed(2)}`;
  }
}

/**
 * Compact currency formatter for high-level dashboard summaries,
 * while preserving clear currency sign and exact thousands/lakhs scale without generic ₹K assumptions.
 */
export function formatCompactMoney(amount: number | null | undefined, currency: string = 'INR'): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '-';
  }

  const normalizedCurrency = (currency || 'INR').trim().toUpperCase();
  const locale = normalizedCurrency === 'INR' ? 'en-IN' : 'en-US';

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: normalizedCurrency,
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return `${normalizedCurrency} ${amount.toLocaleString()}`;
  }
}

/**
 * Formats ISO timestamps into readable localized dates with 24-hour time.
 */
export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return isoString;
  }
}

/**
 * Formats timestamps into relative human-readable time (e.g., '12s ago', '5m ago').
 */
export function formatRelativeTime(date: Date | number | null | undefined): string {
  if (!date) return '-';
  const timestamp = typeof date === 'number' ? date : date.getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (diffSec < 60) {
    return `${diffSec}s ago`;
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
