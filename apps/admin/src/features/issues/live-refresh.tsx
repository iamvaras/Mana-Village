'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LiveStatus } from '@mana/services';
import { getBrowserServices } from '@/lib/supabase/browser';

/** Waits this long after the last change before reloading, so a burst reloads once. */
const REFRESH_DELAY_MS = 800;

/**
 * Keeps a server-rendered issue page up to date. The database sends a small
 * "issue changed" signal (no content) to staff of the village; on each signal the
 * page is re-rendered on the server, so the same permission checks apply again.
 * With `issueId`, only changes to that issue reload the page.
 */
export function LiveRefresh({ villageId, issueId }: { villageId: string; issueId?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let closed = false;
    let close: (() => Promise<void>) | null = null;
    const onChange = (changedId: string) => {
      if (issueId && changedId !== issueId) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        router.refresh();
        setUpdatedAt(new Date());
      }, REFRESH_DELAY_MS);
    };
    getBrowserServices()
      .issueList.subscribeToChanges(villageId, onChange, (s) => {
        if (!closed) setStatus(s);
      })
      .then((sub) => {
        if (closed) void sub.close();
        else close = () => sub.close();
      })
      .catch(() => {
        if (!closed) setStatus('offline');
      });
    return () => {
      closed = true;
      if (timer.current) clearTimeout(timer.current);
      if (close) void close();
    };
  }, [villageId, issueId, router]);

  const dot =
    status === 'live'
      ? 'bg-green-600'
      : status === 'connecting'
        ? 'bg-amber-500'
        : 'bg-neutral-400';
  const text =
    status === 'live'
      ? 'Live updates on'
      : status === 'connecting'
        ? 'Connecting for live updates…'
        : 'Live updates off. Reload the page to see new changes.';

  return (
    <p role="status" className="flex items-center gap-2 text-xs text-neutral-600">
      <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      {text}
      {updatedAt && status === 'live' ? (
        <span className="text-neutral-500">
          · updated {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      ) : null}
    </p>
  );
}
