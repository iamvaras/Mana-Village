'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Announcement } from '@mana/services';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getBrowserServices } from '@/lib/supabase/browser';
import { AnnouncementForm } from './announcement-form';

const dateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

/** Edit, publish (with or without alerting residents) and archive one announcement. */
export function AnnouncementRowActions({
  villageId,
  announcement: a,
}: {
  villageId: string;
  announcement: Announcement;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'edit' | 'publish' | 'archive'>('idle');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function publish() {
    setBusy(true);
    setError(null);
    const res = await getBrowserServices().announcements.publish(a.id, notify);
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    setMode('idle');
    setDone(
      notify
        ? `Published. ${res.value} ${res.value === 1 ? 'resident was' : 'residents were'} alerted.`
        : 'Published without alerting residents.',
    );
    router.refresh();
  }

  async function archive() {
    setBusy(true);
    setError(null);
    const res = await getBrowserServices().announcements.archive(a.id);
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    setMode('idle');
    router.refresh();
  }

  if (mode === 'edit') {
    return (
      <div className="w-full rounded-md border border-neutral-200 bg-neutral-50 p-4">
        <AnnouncementForm
          villageId={villageId}
          initial={{
            id: a.id,
            title: a.title,
            body: a.body,
            titleLocal: a.titleLocal ?? '',
            bodyLocal: a.bodyLocal ?? '',
            isPinned: a.isPinned,
            expires: dateOnly(a.expiresAt),
          }}
          onDone={() => setMode('idle')}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {done ? <Alert tone="success">{done}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {mode === 'publish' ? (
        <div className="flex flex-col items-end gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <label className="flex items-center gap-2 text-sm text-neutral-800">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              className="h-4 w-4"
            />
            Send an alert to every resident of the village
          </label>
          <div className="flex gap-2">
            <Button type="button" busy={busy} onClick={() => void publish()}>
              Publish now
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode('idle')} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : mode === 'archive' ? (
        <div className="flex flex-col items-end gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-sm text-neutral-800">
            Residents will no longer see it. It stays here for the record.
          </p>
          <div className="flex gap-2">
            <Button type="button" busy={busy} onClick={() => void archive()}>
              Archive
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode('idle')} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : a.status !== 'ARCHIVED' ? (
        <div className="flex gap-2">
          {a.status === 'DRAFT' ? (
            <Button type="button" onClick={() => setMode('publish')}>
              Publish
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={() => setMode('edit')}>
            Edit
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode('archive')}>
            Archive
          </Button>
        </div>
      ) : null}
    </div>
  );
}
