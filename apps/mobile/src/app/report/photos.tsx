import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Body, Button, Notice } from '@/components/ui';
import { colors, space } from '@/components/theme';
import { MAX_PHOTOS, type DraftPhoto } from '@/features/report/draft';
import { keepPhoto, removePhotoFile } from '@/features/report/draft-store';
import { pickPhotos } from '@/features/report/photo-pipeline';
import { useReport } from '@/features/report/report-context';
import { StepFrame } from '@/features/report/step-frame';
import { useI18n } from '@/i18n/i18n-provider';

export default function PhotosStep() {
  const { s, f } = useI18n();
  const { draft, category, update } = useReport();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = MAX_PHOTOS - draft.photos.length;

  async function add(source: 'camera' | 'library') {
    setError(null);
    setBusy(true);
    const result = await pickPhotos(source, remaining);
    if (result.kind === 'permission_denied')
      setError(source === 'camera' ? s.report.cameraDenied : s.report.galleryDenied);
    else if (result.kind === 'failed') setError(s.report.photoFailed);
    else if (result.kind === 'picked') {
      try {
        const added: DraftPhoto[] = [];
        for (const p of result.photos) {
          const id = Crypto.randomUUID();
          const localUri = await keepPhoto(p.uri, id);
          added.push({ id, localUri, width: p.width, height: p.height, uploaded: false });
        }
        await update((d) => ({ ...d, photos: [...d.photos, ...added].slice(0, MAX_PHOTOS) }));
      } catch {
        setError(s.report.photoFailed);
      }
    }
    setBusy(false);
  }

  function remove(id: string) {
    const photo = draft.photos.find((p) => p.id === id);
    if (photo) removePhotoFile(photo.localUri);
    void update((d) => ({ ...d, photos: d.photos.filter((p) => p.id !== id) }));
  }

  return (
    <StepFrame step="photos" title={s.report.photosTitle}>
      <Body muted>{f(s.report.photosHint, { max: String(MAX_PHOTOS) })}</Body>
      {category && !category.photoRequired ? <Body muted>{s.report.photosOptional}</Body> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <View style={styles.grid}>
        {draft.photos.map((p) => (
          <View key={p.id} style={styles.tile}>
            <Image
              source={{ uri: p.localUri }}
              style={styles.image}
              accessibilityIgnoresInvertColors
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={s.report.removePhoto}
              onPress={() => remove(p.id)}
              style={styles.remove}
              hitSlop={8}
            >
              <Text style={styles.removeText}>✕</Text>
            </Pressable>
          </View>
        ))}
      </View>
      {busy ? <Body muted>{s.report.processing}</Body> : null}
      {remaining > 0 ? (
        <>
          <Button label={s.report.takePhoto} busy={busy} onPress={() => void add('camera')} />
          <Button
            variant="secondary"
            label={s.report.choosePhoto}
            disabled={busy}
            onPress={() => void add('library')}
          />
        </>
      ) : null}
    </StepFrame>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  image: { width: '100%', height: '100%' },
  remove: {
    position: 'absolute',
    top: space.xs,
    right: space.xs,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: '#fff', fontSize: 16 },
});
