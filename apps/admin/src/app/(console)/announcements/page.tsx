import type { Metadata } from 'next';
import type { Announcement } from '@mana/services';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { AnnouncementForm } from '@/features/announcements/announcement-form';
import { AnnouncementRowActions } from '@/features/announcements/announcement-row-actions';
import { requireStaff } from '@/features/auth/staff-context';
import { getServerServices } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Announcements' };

const STATUS: Record<Announcement['status'], { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-amber-50 text-amber-800' },
  PUBLISHED: { label: 'Published', className: 'bg-green-50 text-green-800' },
  ARCHIVED: { label: 'Archived', className: 'bg-neutral-100 text-neutral-600' },
};

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default async function AnnouncementsPage() {
  const ctx = await requireStaff();
  if (!ctx.permissions.has('announcement.manage')) {
    return (
      <div className="max-w-3xl">
        <h1 className="mb-4 text-2xl font-semibold text-neutral-900">Announcements</h1>
        <Alert>Your role does not include writing announcements.</Alert>
      </div>
    );
  }
  const list = await (await getServerServices()).announcements.listAll(ctx.village.id);
  const expired = (a: Announcement) =>
    a.status === 'PUBLISHED' && a.expiresAt !== null && new Date(a.expiresAt) < new Date();

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Announcements</h1>
        <p className="text-sm text-neutral-600">
          {ctx.village.name}. Published announcements appear in the residents&apos; app; pinned ones
          show on their Home screen.
        </p>
      </div>

      <Card title="Write an announcement">
        <AnnouncementForm villageId={ctx.village.id} />
      </Card>

      <Card title="All announcements">
        {!list.ok ? (
          <Alert tone="error">Could not load announcements: {list.error.message}</Alert>
        ) : list.value.length === 0 ? (
          <p className="text-sm text-neutral-600">
            No announcements yet. Write the first one above.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {list.value.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-neutral-900">
                    {a.title}
                    <span
                      className={`rounded px-1.5 text-xs font-normal ${expired(a) ? STATUS.ARCHIVED.className : STATUS[a.status].className}`}
                    >
                      {expired(a) ? 'Ended' : STATUS[a.status].label}
                    </span>
                    {a.isPinned ? (
                      <span className="rounded bg-brand-50 px-1.5 text-xs font-normal text-brand-700">
                        Pinned
                      </span>
                    ) : null}
                  </p>
                  {a.titleLocal ? (
                    <p lang="te" className="text-sm text-neutral-600">
                      {a.titleLocal}
                    </p>
                  ) : null}
                  <p className="mt-1 line-clamp-2 text-sm whitespace-pre-line text-neutral-700">
                    {a.body}
                  </p>
                  <p className="mt-1 text-xs text-neutral-600">
                    {a.publishedAt
                      ? `Published ${when(a.publishedAt)}`
                      : `Written ${when(a.createdAt)}`}
                    {a.expiresAt ? ` · shown until ${when(a.expiresAt)}` : ''}
                  </p>
                </div>
                <AnnouncementRowActions villageId={ctx.village.id} announcement={a} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
