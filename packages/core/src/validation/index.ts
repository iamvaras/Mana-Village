import { z } from 'zod';
import {
  ATTACHMENT_KINDS,
  CONTENT_VISIBILITIES,
  ISSUE_PRIORITIES,
  ISSUE_VISIBILITIES,
  LANGUAGES,
} from '../enums/index';

/**
 * Client-side input validation. Limits mirror the CHECK constraints in the
 * database, which remain the final authority.
 */
export const LIMITS = {
  titleMin: 5,
  titleMax: 120,
  descriptionMax: 2000,
  locationTextMax: 200,
  reasonMin: 10,
  reasonMax: 500,
  commentMax: 1000,
  nameMin: 2,
  nameMax: 80,
  maxPhotoBytes: 5 * 1024 * 1024,
  maxPhotosPerUpload: 4,
} as const;

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const uuid = z.uuid();
const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

export const reasonSchema = trimmed(LIMITS.reasonMin, LIMITS.reasonMax);

export const createIssueSchema = z
  .object({
    villageId: uuid,
    categoryId: uuid,
    title: trimmed(LIMITS.titleMin, LIMITS.titleMax),
    description: z.string().trim().max(LIMITS.descriptionMax).optional(),
    locationText: z.string().trim().max(LIMITS.locationTextMax).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    locationAccuracyM: z.number().nonnegative().optional(),
    visibility: z.enum(ISSUE_VISIBILITIES).optional(),
    clientRequestId: uuid,
  })
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    message: 'Latitude and longitude must be provided together',
    path: ['latitude'],
  })
  .refine((v) => v.latitude !== undefined || (v.locationText ?? '').length >= 3, {
    message: 'Provide GPS location or a landmark',
    path: ['locationText'],
  });
export type CreateIssueInput = z.infer<typeof createIssueSchema>;

export const registerAttachmentSchema = z.object({
  issueId: uuid,
  attachmentId: uuid,
  kind: z.enum(ATTACHMENT_KINDS),
  mimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(LIMITS.maxPhotoBytes),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  visibility: z.enum(CONTENT_VISIBILITIES).optional(),
});
export type RegisterAttachmentInput = z.infer<typeof registerAttachmentSchema>;

export const addCommentSchema = z.object({
  issueId: uuid,
  body: trimmed(1, LIMITS.commentMax),
  visibility: z.enum(CONTENT_VISIBILITIES),
});
export type AddCommentInput = z.infer<typeof addCommentSchema>;

export const confirmResolutionSchema = z.discriminatedUnion('solved', [
  z.object({
    issueId: uuid,
    solved: z.literal(true),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    issueId: uuid,
    solved: z.literal(false),
    reason: reasonSchema,
    expectedVersion: z.number().int().positive(),
  }),
]);
export type ConfirmResolutionInput = z.infer<typeof confirmResolutionSchema>;

export const assignIssueSchema = z.object({
  issueId: uuid,
  departmentId: uuid,
  assigneeUserId: uuid.optional(),
  note: z.string().trim().max(LIMITS.reasonMax).optional(),
  dueAt: z.iso.datetime({ offset: true }).optional(),
  expectedVersion: z.number().int().positive(),
});
export type AssignIssueInput = z.infer<typeof assignIssueSchema>;

export const setPrioritySchema = z.object({
  issueId: uuid,
  priority: z.enum(ISSUE_PRIORITIES),
  expectedVersion: z.number().int().positive(),
});

export const profileSchema = z.object({
  fullName: trimmed(LIMITS.nameMin, LIMITS.nameMax),
  displayName: z.string().trim().min(1).max(LIMITS.nameMax).optional(),
  homeVillageId: uuid,
  preferredLanguage: z.enum(LANGUAGES),
});
export type ProfileInput = z.infer<typeof profileSchema>;
