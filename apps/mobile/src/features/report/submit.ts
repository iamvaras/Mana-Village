import type { AppError, CreateIssueInput, Result } from '@mana/core';
import type { CreatedIssue, UploadedPhoto } from '@mana/services';
import { effectiveTitle, type DraftPhoto, type ReportDraft } from './draft';

export interface SubmitDeps {
  /** Uploads one stored photo. Must be safe to repeat for the same photo id. */
  uploadPhoto(photo: DraftPhoto, userId: string): Promise<Result<UploadedPhoto>>;
  createIssue(
    input: CreateIssueInput,
    photos: readonly UploadedPhoto[],
  ): Promise<Result<CreatedIssue>>;
  /** Persists progress (which photos are uploaded) so a later retry skips them. */
  saveDraft(draft: ReportDraft): Promise<void>;
  onProgress?(p: SubmitProgress): void;
}

export type SubmitProgress =
  { stage: 'uploading'; done: number; total: number } | { stage: 'creating' };

export type SubmitOutcome =
  { ok: true; issue: CreatedIssue } | { ok: false; error: AppError; draft: ReportDraft };

/**
 * Sends a draft: uploads photos one at a time (each upload is remembered), then
 * creates the issue with the draft's clientRequestId. Calling this again after
 * any failure continues where it stopped and can never create two issues.
 */
export async function submitDraft(
  initial: ReportDraft,
  categoryName: string,
  deps: SubmitDeps,
): Promise<SubmitOutcome> {
  let draft = initial;
  const categoryId = draft.categoryId;
  if (!categoryId) {
    return { ok: false, error: { code: 'VALIDATION', message: 'category missing' }, draft };
  }
  const uploaded: UploadedPhoto[] = [];
  const total = draft.photos.length;

  for (const photo of draft.photos) {
    deps.onProgress?.({ stage: 'uploading', done: uploaded.length, total });
    const res = await deps.uploadPhoto(photo, draft.userId);
    if (!res.ok) return { ok: false, error: res.error, draft };
    uploaded.push(res.value);
    if (!photo.uploaded) {
      draft = {
        ...draft,
        photos: draft.photos.map((p) => (p.id === photo.id ? { ...p, uploaded: true } : p)),
      };
      await deps.saveDraft(draft);
    }
  }

  deps.onProgress?.({ stage: 'creating' });
  const landmark = draft.landmark.trim();
  const description = draft.description.trim();
  const input: CreateIssueInput = {
    villageId: draft.villageId,
    categoryId,
    title: effectiveTitle(draft, categoryName),
    clientRequestId: draft.clientRequestId,
    ...(description ? { description } : {}),
    ...(landmark ? { locationText: landmark } : {}),
    ...(draft.gps
      ? {
          latitude: draft.gps.latitude,
          longitude: draft.gps.longitude,
          ...(draft.gps.accuracyM !== null ? { locationAccuracyM: draft.gps.accuracyM } : {}),
        }
      : {}),
    ...(draft.isPrivate ? { visibility: 'PRIVATE' as const } : {}),
  };
  const created = await deps.createIssue(input, uploaded);
  if (!created.ok) return { ok: false, error: created.error, draft };
  return { ok: true, issue: created.value };
}
