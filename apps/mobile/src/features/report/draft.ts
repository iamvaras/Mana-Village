import { z } from 'zod';
import { LIMITS } from '@mana/core';

/**
 * The report a resident is writing. Saved on the phone after every change so it
 * survives app restarts and lost connections. Pure logic only (no React Native),
 * so it can be unit tested.
 */
export const REPORT_STEPS = [
  'category',
  'photos',
  'location',
  'similar',
  'details',
  'review',
] as const;
export type ReportStep = (typeof REPORT_STEPS)[number];

export const MAX_PHOTOS = LIMITS.maxPhotosPerUpload;

const draftPhotoSchema = z.object({
  /** UUID; also the storage file name, so a retried upload reuses it. */
  id: z.uuid(),
  /** Compressed JPEG kept in the app's own folder until the report is sent. */
  localUri: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  uploaded: z.boolean(),
});
export type DraftPhoto = z.infer<typeof draftPhotoSchema>;

const gpsSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().nullable(),
});
export type GpsFix = z.infer<typeof gpsSchema>;

export const draftSchema = z.object({
  version: z.literal(1),
  /** Sent with create_issue so a retry can never create a second issue. */
  clientRequestId: z.uuid(),
  userId: z.uuid(),
  villageId: z.uuid(),
  step: z.enum(REPORT_STEPS),
  categoryId: z.uuid().nullable(),
  photos: z.array(draftPhotoSchema).max(MAX_PHOTOS),
  gps: gpsSchema.nullable(),
  landmark: z.string().max(LIMITS.locationTextMax),
  title: z.string().max(LIMITS.titleMax),
  description: z.string().max(LIMITS.descriptionMax),
  isPrivate: z.boolean(),
  updatedAt: z.string(),
});
export type ReportDraft = z.infer<typeof draftSchema>;

export function newDraft(input: {
  clientRequestId: string;
  userId: string;
  villageId: string;
  now: Date;
}): ReportDraft {
  return {
    version: 1,
    clientRequestId: input.clientRequestId,
    userId: input.userId,
    villageId: input.villageId,
    step: 'category',
    categoryId: null,
    photos: [],
    gps: null,
    landmark: '',
    title: '',
    description: '',
    isPrivate: false,
    updatedAt: input.now.toISOString(),
  };
}

/** Parses a stored draft; anything unreadable is treated as no draft. */
export function parseDraft(raw: string | null): ReportDraft | null {
  if (!raw) return null;
  try {
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** A draft has content worth offering to resume. */
export function hasProgress(d: ReportDraft): boolean {
  return (
    d.categoryId !== null ||
    d.photos.length > 0 ||
    d.landmark.trim() !== '' ||
    d.description.trim() !== ''
  );
}

export interface CategoryRule {
  id: string;
  photoRequired: boolean;
}

export type StepProblem = 'choose_category' | 'add_photo' | 'add_location' | 'title_too_short';

/** What is still missing before the resident can leave `step`. */
export function stepProblem(
  step: ReportStep,
  d: ReportDraft,
  category: CategoryRule | null,
): StepProblem | null {
  switch (step) {
    case 'category':
      return d.categoryId && category ? null : 'choose_category';
    case 'photos':
      return category?.photoRequired && d.photos.length === 0 ? 'add_photo' : null;
    case 'location':
      return d.gps || d.landmark.trim().length >= 3 ? null : 'add_location';
    case 'similar':
      return null;
    case 'details': {
      const t = d.title.trim();
      return t.length === 0 || t.length >= LIMITS.titleMin ? null : 'title_too_short';
    }
    case 'review':
      return (
        stepProblem('category', d, category) ??
        stepProblem('photos', d, category) ??
        stepProblem('location', d, category) ??
        stepProblem('details', d, category)
      );
  }
}

/** The next step; similar-issue search needs GPS, so it is skipped without it. */
export function nextStep(step: ReportStep, d: ReportDraft): ReportStep {
  const i = REPORT_STEPS.indexOf(step);
  const next = REPORT_STEPS[Math.min(i + 1, REPORT_STEPS.length - 1)] ?? 'review';
  return next === 'similar' && !d.gps ? 'details' : next;
}

/**
 * Title used when the resident leaves it empty, e.g. "Garbage – near Hanuman temple".
 * Always within the database limits.
 */
export function effectiveTitle(d: ReportDraft, categoryName: string): string {
  const typed = d.title.trim();
  if (typed.length >= LIMITS.titleMin) return typed.slice(0, LIMITS.titleMax);
  const landmark = d.landmark.trim();
  let title = landmark ? `${categoryName} – ${landmark}` : categoryName;
  if (title.length < LIMITS.titleMin) title = `${title} (report)`;
  return title.slice(0, LIMITS.titleMax);
}
