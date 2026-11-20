import type { ReactNode } from 'react';
import Link from 'next/link';
import { selectVillageAction } from '@/features/auth/actions';
import { SignOutButton } from '@/features/auth/sign-out-button';
import { requireStaff } from '@/features/auth/staff-context';
import { CURRENT_PHASE, visibleNavItems } from '@/features/navigation/nav';

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const ctx = await requireStaff();
  const items = visibleNavItems(ctx.permissions);

  return (
    <div className="flex min-h-full flex-1">
      <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-5 py-4">
          <p className="text-sm font-semibold tracking-wide text-brand-700">MANA VILLAGE</p>
          <p className="text-xs text-neutral-500">Admin</p>
        </div>
        <nav aria-label="Main" className="flex-1 px-3 py-4">
          <ul className="flex flex-col gap-1">
            {items.map((item) =>
              item.availableFrom <= CURRENT_PHASE ? (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-md px-3 py-2 text-sm text-neutral-800 hover:bg-brand-50"
                  >
                    {item.label}
                  </Link>
                </li>
              ) : (
                <li key={item.href}>
                  <span
                    aria-disabled="true"
                    className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-neutral-400"
                  >
                    {item.label}
                    <span className="rounded bg-neutral-100 px-1.5 text-xs">Soon</span>
                  </span>
                </li>
              ),
            )}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-neutral-200 bg-white px-6 py-3">
          {ctx.villages.length > 1 ? (
            <form action={selectVillageAction} className="flex items-center gap-2">
              <label htmlFor="villageId" className="text-sm text-neutral-600">
                Village
              </label>
              <select
                id="villageId"
                name="villageId"
                defaultValue={ctx.village.id}
                className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm"
              >
                {ctx.villages.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-9 rounded-md border border-neutral-300 px-3 text-sm hover:bg-neutral-50"
              >
                Switch
              </button>
            </form>
          ) : (
            <p className="text-sm font-medium text-neutral-900">{ctx.village.name}</p>
          )}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-neutral-900">{ctx.fullName}</p>
              <p className="text-xs text-neutral-500">{ctx.roleLabels.join(', ')}</p>
            </div>
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
