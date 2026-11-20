import { Directory, File, Paths } from 'expo-file-system';
import { parseDraft, type ReportDraft } from './draft';

/**
 * The draft (JSON) and its compressed photos live in the app's private
 * document folder, which the system does not clear and other apps cannot read.
 */
const draftDir = () => new Directory(Paths.document, 'report-draft');
const draftFile = () => new File(draftDir(), 'draft.json');

function ensureDir(): Directory {
  const dir = draftDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export async function loadDraft(userId: string): Promise<ReportDraft | null> {
  try {
    const file = draftFile();
    if (!file.exists) return null;
    const draft = parseDraft(await file.text());
    // A draft from another account on this phone is never shown.
    if (!draft || draft.userId !== userId) {
      discardDraft();
      return null;
    }
    // Drop photos whose files were lost.
    return { ...draft, photos: draft.photos.filter((p) => new File(p.localUri).exists) };
  } catch {
    return null;
  }
}

export async function saveDraft(draft: ReportDraft): Promise<void> {
  ensureDir();
  await draftFile().write(JSON.stringify(draft));
}

/** Copies a processed photo into the draft folder and returns its new location. */
export async function keepPhoto(sourceUri: string, photoId: string): Promise<string> {
  const target = new File(ensureDir(), `${photoId}.jpg`);
  if (target.exists) target.delete();
  await new File(sourceUri).copy(target);
  return target.uri;
}

export function removePhotoFile(localUri: string): void {
  try {
    const f = new File(localUri);
    if (f.exists) f.delete();
  } catch {
    // Nothing to clean up.
  }
}

export async function readPhotoBytes(localUri: string): Promise<Uint8Array> {
  return new File(localUri).bytes();
}

/** Deletes the draft and all its photos (after sending, or when the resident discards it). */
export function discardDraft(): void {
  try {
    const dir = draftDir();
    if (dir.exists) dir.delete();
  } catch {
    // Already gone.
  }
}
