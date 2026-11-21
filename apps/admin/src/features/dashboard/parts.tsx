import Link from 'next/link';

/** One headline number. Links to the matching All Issues view when `href` is set. */
export function StatTile({
  label,
  value,
  hint,
  href,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  href?: string | undefined;
  emphasis?: boolean;
}) {
  const body = (
    <>
      <p className="text-sm text-neutral-600">{label}</p>
      <p
        className={`mt-1 text-3xl font-semibold tabular-nums ${emphasis ? 'text-red-700' : 'text-neutral-900'}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-neutral-600">{hint}</p> : null}
    </>
  );
  const box = 'block rounded-lg border border-neutral-200 bg-white p-4 shadow-sm';
  return href ? (
    <Link href={href} className={`${box} hover:border-brand-600 hover:bg-brand-50`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

export interface BreakdownRow {
  key: string;
  label: string;
  total: number;
  open: number;
  closed: number;
  extra?: string | undefined;
  href?: string | undefined;
}

/**
 * Counts per category or department. A table, so every number is readable as
 * text; the thin bar beside "Total" only helps compare rows at a glance.
 */
export function BreakdownTable({
  caption,
  rows,
  extraHeading,
  emptyText,
}: {
  caption: string;
  rows: readonly BreakdownRow[];
  extraHeading?: string;
  emptyText: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  if (rows.length === 0) return <p className="text-sm text-neutral-600">{emptyText}</p>;
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-neutral-200 text-left text-xs text-neutral-600">
          <th scope="col" className="py-2 pr-3 font-medium">
            Name
          </th>
          <th scope="col" className="py-2 pr-3 font-medium">
            Total
          </th>
          <th scope="col" className="py-2 pr-3 text-right font-medium">
            Open
          </th>
          <th scope="col" className="py-2 pr-3 text-right font-medium">
            Closed
          </th>
          {extraHeading ? (
            <th scope="col" className="py-2 text-right font-medium">
              {extraHeading}
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b border-neutral-100 last:border-0">
            <th scope="row" className="py-2 pr-3 text-left font-normal text-neutral-900">
              {r.href ? (
                <Link href={r.href} className="hover:underline">
                  {r.label}
                </Link>
              ) : (
                r.label
              )}
            </th>
            <td className="py-2 pr-3">
              <span className="flex items-center gap-2">
                <span className="w-6 text-right tabular-nums text-neutral-900">{r.total}</span>
                <span aria-hidden="true" className="h-2 min-w-16 flex-1 rounded-r bg-neutral-100">
                  <span
                    className="block h-2 rounded-r bg-brand-600"
                    style={{ width: `${(r.total / max) * 100}%` }}
                  />
                </span>
              </span>
            </td>
            <td className="py-2 pr-3 text-right tabular-nums text-neutral-700">{r.open}</td>
            <td className="py-2 pr-3 text-right tabular-nums text-neutral-700">{r.closed}</td>
            {extraHeading ? (
              <td className="py-2 text-right tabular-nums text-neutral-700">{r.extra ?? '–'}</td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
