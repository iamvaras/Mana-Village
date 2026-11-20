import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildTimeline, formatTimelineTime } from '@mana/core';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { requireStaff } from '@/features/auth/staff-context';
import { CommentForm } from '@/features/issues/comment-form';
import { actorText, eventText, STATUS_LABEL, statusClass } from '@/features/issues/labels';
import { getServerServices } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Issue' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requireStaff();
  const services = await getServerServices();

  const [issue, timeline, comments, photos] = await Promise.all([
    services.issueReads.getIssue(id),
    services.issueReads.getTimeline(id),
    services.issueReads.listComments(id),
    services.issueReads.listPhotos(id),
  ]);
  if (!issue.ok)
    return <Alert tone="error">Could not load this issue: {issue.error.message}</Alert>;
  if (!issue.value) notFound();
  const d = issue.value;
  const entries = timeline.ok ? buildTimeline(timeline.value) : [];
  const canWriteInternal = ctx.permissions.has('issue.comment_internal');

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div>
        <Link href="/" className="text-sm text-neutral-600 hover:underline">
          ← Dashboard
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusClass(d.status)}`}>
            {STATUS_LABEL[d.status]}
          </span>
          <span className="text-sm text-neutral-500">{d.issueNumber}</span>
          <span className="text-sm text-neutral-500">Priority: {d.priority.toLowerCase()}</span>
          {d.visibility === 'PRIVATE' ? (
            <span className="text-sm text-neutral-500">Private</span>
          ) : null}
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900">{d.title}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card title="Details">
            <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-neutral-500">Category</dt>
              <dd>{d.categoryName}</dd>
              <dt className="text-neutral-500">Reported by</dt>
              <dd>{d.reporterName ?? 'Resident'}</dd>
              <dt className="text-neutral-500">Reported on</dt>
              <dd>{formatTimelineTime(d.createdAt)}</dd>
              <dt className="text-neutral-500">Location</dt>
              <dd>
                {d.locationText ?? '—'}
                {d.latitude !== null && d.longitude !== null ? (
                  <span className="text-neutral-500">
                    {' '}
                    ({d.latitude.toFixed(5)}, {d.longitude.toFixed(5)})
                  </span>
                ) : null}
              </dd>
              <dt className="text-neutral-500">Affected residents</dt>
              <dd>{d.supporterCount}</dd>
              <dt className="text-neutral-500">Department</dt>
              <dd>{d.assignedDepartmentName ?? '—'}</dd>
              <dt className="text-neutral-500">Assigned to</dt>
              <dd>{d.assignedUserName ?? '—'}</dd>
            </dl>
            {d.description ? (
              <p className="mt-4 whitespace-pre-wrap text-sm text-neutral-800">{d.description}</p>
            ) : null}
          </Card>

          <Card title="Photos">
            {!photos.ok ? (
              <Alert tone="error">Could not load photos.</Alert>
            ) : photos.value.length === 0 ? (
              <p className="text-sm text-neutral-500">No photos.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.value.map((p) => (
                  <li key={p.id} className="flex flex-col gap-1">
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noreferrer noopener">
                        {/* Short-lived private link from Storage. */}
                        <img
                          src={p.url}
                          alt={`${p.kind.toLowerCase()} photo`}
                          className="aspect-square w-full rounded-md object-cover"
                        />
                      </a>
                    ) : (
                      <div className="flex aspect-square items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-500">
                        Not available
                      </div>
                    )}
                    <span className="text-xs text-neutral-500">
                      {p.kind.replace('_', ' ').toLowerCase()} · {formatTimelineTime(p.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Comments and notes">
            {!comments.ok ? (
              <Alert tone="error">Could not load comments.</Alert>
            ) : comments.value.length === 0 ? (
              <p className="text-sm text-neutral-500">No comments yet.</p>
            ) : (
              <ul className="mb-6 flex flex-col gap-3">
                {comments.value.map((c) => (
                  <li
                    key={c.id}
                    className={`rounded-md border p-3 text-sm ${c.visibility === 'INTERNAL' ? 'border-amber-200 bg-amber-50' : 'border-neutral-200'}`}
                  >
                    <p className="text-xs text-neutral-500">
                      {actorText({
                        isMine: c.isMine,
                        isSystem: false,
                        actorName: c.authorName,
                        actorRoleKey: c.authorRoleKey,
                      })}{' '}
                      · {formatTimelineTime(c.createdAt)}
                      {c.visibility === 'INTERNAL' ? ' · Internal note' : ''}
                      {c.isHidden ? ' · Hidden' : ''}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-neutral-900">{c.body ?? ''}</p>
                  </li>
                ))}
              </ul>
            )}
            <CommentForm issueId={d.id} canWriteInternal={canWriteInternal} />
          </Card>
        </div>

        <Card title="Timeline">
          {!timeline.ok ? (
            <Alert tone="error">Could not load the timeline.</Alert>
          ) : (
            <ol className="flex flex-col">
              {entries.map((e, i) => (
                <li key={`${e.eventType}-${e.sourceId}`} className="flex gap-3">
                  <div className="flex w-3 flex-col items-center">
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 rounded-full ${e.kind === 'status' ? 'bg-brand-600' : 'bg-neutral-300'}`}
                    />
                    {i < entries.length - 1 ? (
                      <span className="w-px flex-1 bg-neutral-200" />
                    ) : null}
                  </div>
                  <div className="pb-5 text-sm">
                    <p className="font-medium text-neutral-900">
                      {eventText(e)}
                      {e.visibility === 'INTERNAL' ? (
                        <span className="ml-2 text-xs text-amber-700">internal</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {actorText(e)} · {formatTimelineTime(e.occurredAt)}
                    </p>
                    {e.reason ? <p className="mt-1 text-neutral-700">{e.reason}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
