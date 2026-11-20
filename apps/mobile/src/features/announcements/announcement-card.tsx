import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { announcementText, type Announcement } from '@mana/services';
import { colors, space } from '@/components/theme';
import { useI18n } from '@/i18n/i18n-provider';

export function AnnouncementCard({ item }: { item: Announcement }) {
  const { s, language } = useI18n();
  const text = announcementText(item, language);
  const locale = language === 'te' ? 'te-IN' : 'en-IN';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/announcements/[id]', params: { id: item.id } })}
      style={({ pressed }) => [
        styles.card,
        item.isPinned && styles.pinned,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.row}>
        {item.isPinned ? <Text style={styles.pin}>{s.announcements.pinned}</Text> : null}
        {item.publishedAt ? (
          <Text style={styles.meta}>
            {new Date(item.publishedAt).toLocaleDateString(locale, {
              day: 'numeric',
              month: 'short',
            })}
          </Text>
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {text.title}
      </Text>
      <Text style={styles.body} numberOfLines={2}>
        {text.body}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: space.lg,
    gap: space.xs,
    borderWidth: 1,
    borderColor: '#e7e7e2',
  },
  pinned: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  pressed: { opacity: 0.85 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pin: { fontSize: 12, fontWeight: '600', color: colors.brand },
  meta: { fontSize: 13, color: colors.muted, marginLeft: 'auto' },
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, color: colors.text },
});
