import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button } from '@/components/ui';
import { colors, space } from '@/components/theme';
import { useI18n } from '@/i18n/i18n-provider';
import {
  MAX_ATTACHED_PHOTOS,
  type AddPhotoProblem,
  type useAttachedPhotos,
} from './attached-photos';

/** Thumbnails with Remove, a counter, and Take / Choose photo buttons. */
export function PhotoAttacher({
  photos,
  busy,
  onError,
}: {
  photos: ReturnType<typeof useAttachedPhotos>;
  busy: boolean;
  onError: (message: string | null) => void;
}) {
  const { s, f } = useI18n();
  const problemText: Record<AddPhotoProblem, string> = {
    camera_denied: s.attach.cameraDenied,
    photos_denied: s.attach.photosDenied,
    failed: s.attach.photoFailed,
  };

  async function add(source: 'camera' | 'library') {
    onError(null);
    const problem = await photos.add(source);
    if (problem) onError(problemText[problem]);
  }

  return (
    <View style={styles.wrap}>
      {photos.photos.length > 0 ? (
        <View style={styles.photos}>
          {photos.photos.map((p) => (
            <View key={p.id} style={styles.photoBox}>
              <Image source={{ uri: p.uri }} style={styles.photo} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={s.attach.removePhoto}
                disabled={busy}
                onPress={() => photos.remove(p.id)}
              >
                <Text style={styles.remove}>{s.attach.removePhoto}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <Body muted>
        {f(s.attach.photoCount, {
          n: String(photos.photos.length),
          max: String(MAX_ATTACHED_PHOTOS),
        })}
      </Body>
      {photos.photos.length < MAX_ATTACHED_PHOTOS ? (
        <View style={styles.row}>
          <View style={styles.half}>
            <Button
              variant="secondary"
              label={s.attach.takePhoto}
              disabled={busy}
              onPress={() => void add('camera')}
            />
          </View>
          <View style={styles.half}>
            <Button
              variant="secondary"
              label={s.attach.choosePhoto}
              disabled={busy}
              onPress={() => void add('library')}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  photoBox: { alignItems: 'center', gap: 2 },
  photo: { width: 72, height: 72, borderRadius: 8, backgroundColor: colors.border },
  remove: { fontSize: 13, color: colors.danger },
  row: { flexDirection: 'row', gap: space.sm },
  half: { flex: 1 },
});
