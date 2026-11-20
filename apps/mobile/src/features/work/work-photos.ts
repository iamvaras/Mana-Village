import { useState } from 'react';
import * as Crypto from 'expo-crypto';
import { LIMITS, type Result } from '@mana/core';
import type { UploadedPhoto } from '@mana/services';
import { readPhotoBytes } from '@/features/report/draft-store';
import { pickPhotos } from '@/features/report/photo-pipeline';
import { services } from '@/lib/supabase';

export const MAX_WORK_PHOTOS = LIMITS.maxPhotosPerUpload;

export interface WorkPhoto {
  id: string;
  uri: string;
  width: number;
  height: number;
  /** Set once sent, so a retry does not send it again. */
  uploaded?: UploadedPhoto;
}

export type AddPhotoProblem = 'camera_denied' | 'photos_denied' | 'failed';

/** Work photos picked on the phone (resized, EXIF removed) and sent before the action. */
export function useWorkPhotos() {
  const [photos, setPhotos] = useState<WorkPhoto[]>([]);

  async function add(source: 'camera' | 'library'): Promise<AddPhotoProblem | null> {
    const result = await pickPhotos(source, MAX_WORK_PHOTOS - photos.length);
    if (result.kind === 'permission_denied')
      return source === 'camera' ? 'camera_denied' : 'photos_denied';
    if (result.kind === 'failed') return 'failed';
    if (result.kind === 'picked') {
      const added = result.photos.map((p) => ({ ...p, id: Crypto.randomUUID() }));
      setPhotos((prev) => [...prev, ...added].slice(0, MAX_WORK_PHOTOS));
    }
    return null;
  }

  const remove = (id: string) => setPhotos((prev) => prev.filter((p) => p.id !== id));
  const clear = () => setPhotos([]);

  /** Sends every photo not sent yet. Stops at the first failure. */
  async function upload(
    userId: string,
    onProgress: (done: number, total: number) => void,
  ): Promise<Result<UploadedPhoto[]>> {
    if (!services) return { ok: false, error: { code: 'UNKNOWN', message: 'not configured' } };
    const done: UploadedPhoto[] = [];
    const next = [...photos];
    for (const [i, photo] of next.entries()) {
      onProgress(i + 1, next.length);
      if (photo.uploaded) {
        done.push(photo.uploaded);
        continue;
      }
      let body: Uint8Array;
      try {
        body = await readPhotoBytes(photo.uri);
      } catch {
        return { ok: false, error: { code: 'UPLOAD_FAILED', message: 'photo file missing' } };
      }
      const res = await services.issues.uploadPhoto({
        id: photo.id,
        userId,
        mimeType: 'image/jpeg',
        body,
        width: photo.width,
        height: photo.height,
      });
      if (!res.ok) {
        setPhotos(next);
        return res;
      }
      next[i] = { ...photo, uploaded: res.value };
      done.push(res.value);
    }
    setPhotos(next);
    return { ok: true, value: done };
  }

  return { photos, add, remove, clear, upload };
}
