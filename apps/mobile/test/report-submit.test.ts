import { describe, expect, it } from 'vitest';
import type { AppError, CreateIssueInput, Result } from '@mana/core';
import type { CreatedIssue, UploadedPhoto } from '@mana/services';
import { newDraft, type DraftPhoto, type ReportDraft } from '../src/features/report/draft';
import { submitDraft, type SubmitDeps } from '../src/features/report/submit';

const NETWORK: AppError = { code: 'NETWORK', message: 'Network request failed' };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function draftWithPhotos(count: number): ReportDraft {
  const d = newDraft({
    clientRequestId: uuid(1),
    userId: uuid(2),
    villageId: uuid(3),
    now: new Date(0),
  });
  const photos: DraftPhoto[] = Array.from({ length: count }, (_, i) => ({
    id: uuid(10 + i),
    localUri: `file:///photo-${i}.jpg`,
    width: 1600,
    height: 1200,
    uploaded: false,
  }));
  return {
    ...d,
    categoryId: uuid(4),
    photos,
    landmark: 'Near the well',
    gps: { latitude: 16.5, longitude: 80.6, accuracyM: 8 },
  };
}

/** A fake server whose network fails on the calls we choose. */
function fakeServer(failOn: { uploads?: number[]; creates?: number[] }) {
  let uploadCalls = 0;
  let createCalls = 0;
  const stored = new Set<string>();
  const issuesByRequest = new Map<string, CreatedIssue>();
  const saved: ReportDraft[] = [];
  const uploadAttempts: string[] = [];
  const createInputs: CreateIssueInput[] = [];

  const deps: SubmitDeps = {
    async uploadPhoto(photo: DraftPhoto, userId: string): Promise<Result<UploadedPhoto>> {
      uploadCalls++;
      uploadAttempts.push(photo.id);
      if (failOn.uploads?.includes(uploadCalls)) return { ok: false, error: NETWORK };
      stored.add(photo.id);
      return {
        ok: true,
        value: {
          id: photo.id,
          path: `${userId}/${photo.id}.jpg`,
          width: photo.width,
          height: photo.height,
        },
      };
    },
    async createIssue(input, photos): Promise<Result<CreatedIssue>> {
      createCalls++;
      createInputs.push(input);
      const existing = issuesByRequest.get(input.clientRequestId);
      // Simulates "server created it but the reply was lost".
      if (failOn.creates?.includes(createCalls)) {
        if (!existing)
          issuesByRequest.set(input.clientRequestId, {
            id: uuid(99),
            issueNumber: 'RMP-2026-00001',
            created: true,
          });
        return { ok: false, error: NETWORK };
      }
      if (existing) return { ok: true, value: { ...existing, created: false } };
      expect(photos.every((p) => stored.has(p.id))).toBe(true);
      const issue = { id: uuid(99), issueNumber: 'RMP-2026-00001', created: true };
      issuesByRequest.set(input.clientRequestId, issue);
      return { ok: true, value: issue };
    },
    async saveDraft(d) {
      saved.push(d);
    },
  };
  return { deps, saved, uploadAttempts, createInputs, issueCount: () => issuesByRequest.size };
}

describe('submitting a report with an unreliable network', () => {
  it('sends photos then the issue, with GPS, landmark and generated title', async () => {
    const server = fakeServer({});
    const out = await submitDraft(draftWithPhotos(2), 'Drainage', server.deps);
    expect(out.ok).toBe(true);
    expect(server.createInputs[0]).toMatchObject({
      title: 'Drainage – Near the well',
      locationText: 'Near the well',
      latitude: 16.5,
      longitude: 80.6,
      locationAccuracyM: 8,
      clientRequestId: uuid(1),
    });
    expect(server.createInputs[0]?.visibility).toBeUndefined();
  });

  it('continues after a photo upload fails, without re-marking finished photos', async () => {
    const server = fakeServer({ uploads: [2] });
    const first = await submitDraft(draftWithPhotos(3), 'Road', server.deps);
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.error.code).toBe('NETWORK');
    expect(first.draft.photos.map((p) => p.uploaded)).toEqual([true, false, false]);
    expect(server.saved.at(-1)?.photos[0]?.uploaded).toBe(true);

    const second = await submitDraft(first.draft, 'Road', server.deps);
    expect(second.ok).toBe(true);
    expect(server.issueCount()).toBe(1);
  });

  it('never creates two issues when the reply to create is lost', async () => {
    const server = fakeServer({ creates: [1] });
    const first = await submitDraft(draftWithPhotos(1), 'Garbage', server.deps);
    expect(first.ok).toBe(false);
    if (first.ok) return;
    const second = await submitDraft(first.draft, 'Garbage', server.deps);
    expect(second.ok && second.issue).toEqual({
      id: uuid(99),
      issueNumber: 'RMP-2026-00001',
      created: false,
    });
    expect(server.issueCount()).toBe(1);
    expect(new Set(server.createInputs.map((i) => i.clientRequestId)).size).toBe(1);
  });

  it('marks a private report as PRIVATE', async () => {
    const server = fakeServer({});
    await submitDraft({ ...draftWithPhotos(1), isPrivate: true }, 'Water', server.deps);
    expect(server.createInputs[0]?.visibility).toBe('PRIVATE');
  });

  it('refuses a draft without a category', async () => {
    const server = fakeServer({});
    const out = await submitDraft({ ...draftWithPhotos(0), categoryId: null }, 'x', server.deps);
    expect(out.ok ? 'ok' : out.error.code).toBe('VALIDATION');
    expect(server.uploadAttempts).toHaveLength(0);
  });
});
