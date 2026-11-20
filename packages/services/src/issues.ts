import {
  createIssueSchema,
  LIMITS,
  ok,
  type CreateIssueInput,
  type IssueStatus,
  type Result,
} from '@mana/core';
import type { ManaClient } from './client';
import { required, run, toAppError, validationError } from './errors';

export const ATTACHMENTS_BUCKET = 'issue-attachments';

export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

const EXTENSION: Readonly<Record<ImageMimeType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface Category {
  id: string;
  key: string;
  name: string;
  nameLocal: string | null;
  icon: string | null;
  photoRequired: boolean;
}

/** A photo already uploaded to storage, ready to attach to an issue. */
export interface UploadedPhoto {
  id: string;
  path: string;
  width?: number;
  height?: number;
}

export interface PhotoUpload {
  /** Client-generated UUID; also the file name, so retries reuse the same object. */
  id: string;
  userId: string;
  mimeType: ImageMimeType;
  body: ArrayBuffer | Uint8Array;
  width?: number;
  height?: number;
}

export interface SimilarIssue {
  id: string;
  issueNumber: string;
  title: string;
  status: IssueStatus;
  supporterCount: number;
  distanceM: number;
  createdAt: string;
  iSupport: boolean;
}

export interface CreatedIssue {
  id: string;
  issueNumber: string;
  /** false when this was a retry of a request the server had already completed. */
  created: boolean;
}

export interface IssuesService {
  listCategories(): Promise<Result<Category[]>>;
  /** Uploads one photo to the reporter's own folder. Safe to call again after a failure. */
  uploadPhoto(input: PhotoUpload): Promise<Result<UploadedPhoto>>;
  /** Creates the issue. Repeating with the same clientRequestId returns the same issue. */
  createIssue(
    input: CreateIssueInput,
    photos: readonly UploadedPhoto[],
  ): Promise<Result<CreatedIssue>>;
  findSimilar(input: {
    villageId: string;
    categoryId: string;
    latitude: number;
    longitude: number;
  }): Promise<Result<SimilarIssue[]>>;
  /** "I'm affected too". Returns the new supporter count. */
  support(issueId: string): Promise<Result<number>>;
  unsupport(issueId: string): Promise<Result<number>>;
}

/** Photos already uploaded, in the shape the database functions take. */
export const attachmentsPayload = (photos: readonly UploadedPhoto[]) =>
  photos.map((p) => ({
    id: p.id,
    path: p.path,
    ...(p.width ? { width: p.width } : {}),
    ...(p.height ? { height: p.height } : {}),
  }));

export function photoPath(userId: string, id: string, mimeType: ImageMimeType): string {
  return `${userId}/${id}.${EXTENSION[mimeType]}`;
}

/** Storage answers 409 / "already exists" when a retried upload had in fact succeeded. */
function isAlreadyUploaded(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const x = e as { message?: unknown; statusCode?: unknown; status?: unknown };
  const status = String(x.statusCode ?? x.status ?? '');
  return (
    status === '409' ||
    (typeof x.message === 'string' && /already exists|duplicate/i.test(x.message))
  );
}

function byteLength(body: ArrayBuffer | Uint8Array): number {
  return body.byteLength;
}

export function createIssuesService(client: ManaClient): IssuesService {
  return {
    async listCategories() {
      const res = required(
        await run(() =>
          client
            .from('issue_categories')
            .select('id, key, name, name_local, icon, photo_required')
            .eq('is_active', true)
            .order('sort_order'),
        ),
      );
      if (!res.ok) return res;
      return ok(
        res.value.map((c) => ({
          id: c.id,
          key: c.key,
          name: c.name,
          nameLocal: c.name_local,
          icon: c.icon,
          photoRequired: c.photo_required,
        })),
      );
    },

    async uploadPhoto(input) {
      const size = byteLength(input.body);
      if (size === 0) return validationError({ photo: 'The photo is empty.' });
      if (size > LIMITS.maxPhotoBytes)
        return validationError({ photo: 'The photo must be 5 MB or smaller.' });
      const path = photoPath(input.userId, input.id, input.mimeType);
      try {
        const { error } = await client.storage
          .from(ATTACHMENTS_BUCKET)
          .upload(path, input.body, { contentType: input.mimeType, upsert: false });
        if (error && !isAlreadyUploaded(error)) {
          const appError = toAppError(error);
          return {
            ok: false,
            error: appError.code === 'UNKNOWN' ? { ...appError, code: 'UPLOAD_FAILED' } : appError,
          };
        }
      } catch (e) {
        const appError = toAppError(e);
        return {
          ok: false,
          error: appError.code === 'UNKNOWN' ? { ...appError, code: 'UPLOAD_FAILED' } : appError,
        };
      }
      return ok({
        id: input.id,
        path,
        ...(input.width ? { width: input.width } : {}),
        ...(input.height ? { height: input.height } : {}),
      });
    },

    async createIssue(input, photos) {
      const parsed = createIssueSchema.safeParse(input);
      if (!parsed.success) {
        const fields: Record<string, string> = {};
        for (const issue of parsed.error.issues)
          fields[String(issue.path[0] ?? 'form')] = issue.message;
        return validationError(fields);
      }
      if (photos.length > LIMITS.maxPhotosPerUpload) {
        return validationError({ photos: `At most ${LIMITS.maxPhotosPerUpload} photos.` });
      }
      const v = parsed.data;
      const res = required(
        await run(() =>
          client.rpc('create_issue', {
            p_village_id: v.villageId,
            p_category_id: v.categoryId,
            p_title: v.title,
            p_client_request_id: v.clientRequestId,
            ...(v.description ? { p_description: v.description } : {}),
            ...(v.locationText ? { p_location_text: v.locationText } : {}),
            ...(v.latitude !== undefined && v.longitude !== undefined
              ? { p_latitude: v.latitude, p_longitude: v.longitude }
              : {}),
            ...(v.locationAccuracyM !== undefined
              ? { p_location_accuracy_m: v.locationAccuracyM }
              : {}),
            ...(v.visibility ? { p_visibility: v.visibility } : {}),
            p_attachments: photos.map((p) => ({
              id: p.id,
              path: p.path,
              ...(p.width ? { width: p.width } : {}),
              ...(p.height ? { height: p.height } : {}),
            })),
            p_source: 'MOBILE',
          }),
        ),
      );
      if (!res.ok) return res;
      const body = res.value as { id?: unknown; issue_number?: unknown; created?: unknown };
      if (typeof body.id !== 'string' || typeof body.issue_number !== 'string') {
        return { ok: false, error: toAppError({ message: 'unexpected create_issue response' }) };
      }
      return ok({ id: body.id, issueNumber: body.issue_number, created: body.created === true });
    },

    async findSimilar(input) {
      const res = required(
        await run(() =>
          client.rpc('find_similar_issues', {
            p_village_id: input.villageId,
            p_category_id: input.categoryId,
            p_latitude: input.latitude,
            p_longitude: input.longitude,
          }),
        ),
      );
      if (!res.ok) return res;
      return ok(
        res.value.map((r) => ({
          id: r.id,
          issueNumber: r.issue_number,
          title: r.title,
          status: r.status,
          supporterCount: r.supporter_count,
          distanceM: r.distance_m,
          createdAt: r.created_at,
          iSupport: r.i_support,
        })),
      );
    },

    async support(issueId) {
      return required(await run(() => client.rpc('support_issue', { p_issue_id: issueId })));
    },

    async unsupport(issueId) {
      return required(await run(() => client.rpc('unsupport_issue', { p_issue_id: issueId })));
    },
  };
}
