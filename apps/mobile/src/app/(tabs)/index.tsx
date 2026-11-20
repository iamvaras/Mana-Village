import { router } from 'expo-router';
import { Body, Button, Card, Screen, Title } from '@/components/ui';
import { useReadyProfile } from '@/features/auth/session-provider';
import { AnnouncementCard } from '@/features/announcements/announcement-card';
import { useAnnouncements } from '@/features/announcements/hooks';
import { useVillages, villageLabel } from '@/features/profile/use-villages';
import { useI18n } from '@/i18n/i18n-provider';

export default function HomeScreen() {
  const { s, f, language } = useI18n();
  const profile = useReadyProfile();
  const villages = useVillages();
  const village = villages.data?.find((v) => v.id === profile.home_village_id);
  const announcements = useAnnouncements(profile.home_village_id);
  const top = announcements.data?.[0];

  return (
    <Screen>
      <Title>{f(s.home.greeting, { name: profile.display_name ?? profile.full_name })}</Title>
      {village ? (
        <Body muted>{f(s.home.village, { village: villageLabel(village, language) })}</Body>
      ) : null}
      <Card>
        <Body muted>{s.home.reportHint}</Body>
        <Button label={s.home.reportTitle} onPress={() => router.push('/report')} />
      </Card>
      {top ? (
        <>
          <Body muted>{s.announcements.fromPanchayat}</Body>
          <AnnouncementCard item={top} />
          {(announcements.data?.length ?? 0) > 1 ? (
            <Button
              variant="link"
              label={s.announcements.seeAll}
              onPress={() => router.push('/announcements')}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
