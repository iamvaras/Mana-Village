'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { LIMITS } from '@mana/core';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getBrowserServices } from '@/lib/supabase/browser';

/** Adds a public comment or an internal note. The database checks who may do which. */
export function CommentForm({
  issueId,
  canWriteInternal,
}: {
  issueId: string;
  canWriteInternal: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'INTERNAL'>(
    canWriteInternal ? 'INTERNAL' : 'PUBLIC',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await getBrowserServices().issueReads.addComment(issueId, body, visibility);
    setBusy(false);
    if (!res.ok) return setError(res.error.fields?.['body'] ?? res.error.message);
    setBody('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {canWriteInternal ? (
        <fieldset className="flex gap-4 text-sm">
          <legend className="sr-only">Who can see this</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="visibility"
              checked={visibility === 'INTERNAL'}
              onChange={() => setVisibility('INTERNAL')}
            />
            Internal note (staff and assigned worker only)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="visibility"
              checked={visibility === 'PUBLIC'}
              onChange={() => setVisibility('PUBLIC')}
            />
            Public comment (residents can see)
          </label>
        </fieldset>
      ) : null}
      <label htmlFor="comment" className="sr-only">
        Comment
      </label>
      <textarea
        id="comment"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={LIMITS.commentMax}
        rows={3}
        className="rounded-md border border-neutral-300 bg-white p-3 text-sm focus:outline-2 focus:outline-brand-600"
        placeholder={
          visibility === 'INTERNAL' ? 'Note for staff and the worker' : 'Update for residents'
        }
      />
      <div>
        <Button type="submit" busy={busy} disabled={body.trim().length === 0}>
          {visibility === 'INTERNAL' ? 'Add internal note' : 'Post public comment'}
        </Button>
      </div>
    </form>
  );
}
