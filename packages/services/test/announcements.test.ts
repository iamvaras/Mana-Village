import { describe, expect, it } from 'vitest';
import {
  announcementProblems,
  announcementText,
  sortForReaders,
  type Announcement,
} from '../src/index';

const a = (id: string, isPinned: boolean, publishedAt: string | null): Announcement => ({
  id,
  villageId: 'v',
  title: 'Water supply off',
  body: 'No water on Sunday',
  titleLocal: 'నీటి సరఫరా ఉండదు',
  bodyLocal: null,
  status: 'PUBLISHED',
  isPinned,
  publishedAt,
  expiresAt: null,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
});

describe('announcements', () => {
  it('checks the same limits as the database', () => {
    expect(announcementProblems({ title: 'Hi', body: '' })).toEqual({
      title: 'Use 3 to 150 characters.',
      body: 'Write the message (at most 5000 characters).',
    });
    expect(
      announcementProblems({
        title: 'Water supply off',
        body: 'Sunday',
        expiresAt: new Date(Date.now() - 1000),
      }),
    ).toEqual({ expiresAt: 'The end date must be in the future.' });
    expect(announcementProblems({ title: 'Water supply off', body: 'Sunday' })).toBeNull();
  });

  it('shows Telugu where it was written, English otherwise', () => {
    expect(announcementText(a('1', false, null), 'te')).toEqual({
      title: 'నీటి సరఫరా ఉండదు',
      body: 'No water on Sunday',
    });
    expect(announcementText(a('1', false, null), 'en').title).toBe('Water supply off');
  });

  it('puts pinned first, then the newest', () => {
    const list = [
      a('old', false, '2026-11-01T00:00:00Z'),
      a('new', false, '2026-11-10T00:00:00Z'),
      a('pinned', true, '2026-10-01T00:00:00Z'),
    ];
    expect(sortForReaders(list).map((x) => x.id)).toEqual(['pinned', 'new', 'old']);
  });
});
