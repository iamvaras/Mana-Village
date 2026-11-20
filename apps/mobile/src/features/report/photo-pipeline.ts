import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Longest side after resizing; keeps detail while staying well under the 5 MB limit. */
export const MAX_DIMENSION = 1600;
export const JPEG_QUALITY = 0.7;

export interface ProcessedPhoto {
  uri: string;
  width: number;
  height: number;
}

export type PickResult =
  | { kind: 'picked'; photos: ProcessedPhoto[] }
  | { kind: 'cancelled' }
  | { kind: 'permission_denied' }
  | { kind: 'failed' };

/**
 * Resize to at most 1600 px and re-encode as JPEG. Re-encoding also removes
 * EXIF data (including the GPS position and phone model stored in the photo).
 */
export async function processPhoto(
  uri: string,
  width: number,
  height: number,
): Promise<ProcessedPhoto> {
  const context = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_DIMENSION) {
    context.resize(width >= height ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

export async function pickPhotos(
  source: 'camera' | 'library',
  remaining: number,
): Promise<PickResult> {
  if (remaining <= 0) return { kind: 'cancelled' };
  try {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { kind: 'permission_denied' };

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 1,
      exif: false,
      allowsMultipleSelection: source === 'library' && remaining > 1,
      selectionLimit: remaining,
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return { kind: 'cancelled' };

    const photos: ProcessedPhoto[] = [];
    for (const asset of result.assets.slice(0, remaining)) {
      photos.push(await processPhoto(asset.uri, asset.width, asset.height));
    }
    return { kind: 'picked', photos };
  } catch {
    return { kind: 'failed' };
  }
}
