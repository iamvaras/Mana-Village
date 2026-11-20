import type { ReactNode } from 'react';

export function Card({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-neutral-200 bg-white p-6 shadow-sm ${className}`}>
      {title ? <h2 className="mb-4 text-lg font-semibold text-neutral-900">{title}</h2> : null}
      {children}
    </section>
  );
}

/** Centered single-card page used by sign-in screens. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-sm font-semibold tracking-wide text-brand-700">
          MANA VILLAGE · ADMIN
        </p>
        <Card>
          <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-neutral-600">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </Card>
      </div>
    </main>
  );
}
