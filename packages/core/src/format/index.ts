const ISSUE_NUMBER_RE = /^([A-Z]{2,6})-(\d{4})-(\d{5,})$/;

/** Format an issue number, e.g. ("VLG", 2026, 124) → "VLG-2026-00124". Mirrors the DB. */
export function formatIssueNumber(villageCode: string, year: number, seq: number): string {
  return `${villageCode}-${year}-${String(seq).padStart(5, '0')}`;
}

export function parseIssueNumber(
  value: string,
): { villageCode: string; year: number; seq: number } | null {
  const m = ISSUE_NUMBER_RE.exec(value);
  if (!m || !m[1] || !m[2] || !m[3]) return null;
  return { villageCode: m[1], year: Number(m[2]), seq: Number(m[3]) };
}

/** Format a timestamp for timelines in the village time zone (default IST). */
export function formatTimelineTime(
  iso: string,
  locale: string = 'en-IN',
  timeZone: string = 'Asia/Kolkata',
): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));
}

/**
 * Normalize an Indian mobile number to Supabase Auth format: "91XXXXXXXXXX".
 * Accepts "98765 43210", "+91 98765-43210", "919876543210". Returns null if invalid.
 */
export function normalizeIndianPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(local) ? `91${local}` : null;
}

/** "919876543210" → "+91 98765 43210" for display. */
export function formatIndianPhone(normalized: string): string {
  const local = normalized.startsWith('91') ? normalized.slice(2) : normalized;
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
}
