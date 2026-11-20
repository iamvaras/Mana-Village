import { useMemo, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { buildTimeline, formatTimelineTime, TERMINAL_STATUSES } from '@mana/core';
import { Body, Button, Card, CenteredState, Notice, TextField, Title } from '@/components/ui';
import { colors, space } from '@/components/theme';
import { issueKeys, useComments, useIssue, usePhotos, useTimeline } from '@/features/issues/hooks';
import { StatusChip } from '@/features/issues/status-chip';
import { actorLabel, timelineText } from '@/features/issues/timeline-text';
import { useIsWorker, useMyWork } from '@/features/work/hooks';
import { WorkPanel } from '@/features/work/work-panel';
import { useI18n } from '@/i18n/i18n-provider';
import { services } from '@/lib/supabase';

export default function IssueDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { s, f, language, errorText } = useI18n();
  const queryClient = useQueryClient();
  const issue = useIssue(id);
  const timeline = useTimeline(id);
  const comments = useComments(id);
  const photos = usePhotos(id);
  const worker = useIsWorker();
  const work = useMyWork(worker);
  const workItem = work.data?.find((w) => w.issueId === id);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const locale = language === 'te' ? 'te-IN' : 'en-IN';
  const entries = useMemo(() => buildTimeline(timeline.data ?? []), [timeline.data]);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: issueKeys.detail(id) }),
      ...(worker ? [work.refetch()] : []),
    ]);

  async function sendComment() {
    if (!services) return;
    setMessage(null);
    setBusy(true);
    const res = await services.issueReads.addComment(id, comment);
    setBusy(false);
    if (!res.ok) return setMessage(errorText(res.error));
    setComment('');
    await refresh();
  }

  async function support() {
    if (!services) return;
    setMessage(null);
    setBusy(true);
    const res = await services.issues.support(id);
    setBusy(false);
    if (!res.ok) return setMessage(errorText(res.error));
    await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ['my-issues'] })]);
  }

  if (issue.isPending) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ headerShown: true, title: s.issue.title }} />
        <CenteredState loading />
      </SafeAreaView>
    );
  }
  if (issue.isError || !issue.data) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ headerShown: true, title: s.issue.title }} />
        <CenteredState
          body={issue.isError ? errorText(issue.error) : s.issue.notFound}
          action={
            issue.isError ? (
              <Button label={s.common.retry} onPress={() => void issue.refetch()} />
            ) : undefined
          }
        />
      </SafeAreaView>
    );
  }

  const d = issue.data;
  const category = language === 'te' && d.categoryNameLocal ? d.categoryNameLocal : d.categoryName;
  const canComment = d.isMine || d.iSupport || d.iAmAssignee;
  const canSupport =
    !d.isMine && !d.iSupport && d.visibility === 'PUBLIC' && !TERMINAL_STATUSES.includes(d.status);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: true, title: d.issueNumber }} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={issue.isRefetching}
            onRefresh={() => void refresh()}
            tintColor={colors.brand}
          />
        }
      >
        <StatusChip status={d.status} />
        <Title>{d.title}</Title>
        <Body muted>
          {category} · {f(s.issue.affected, { n: String(d.supporterCount) })}
          {d.visibility === 'PRIVATE' ? ` · ${s.issue.private}` : ''}
        </Body>
        {d.description ? <Body>{d.description}</Body> : null}

        <Card>
          <Row
            label={s.issue.reportedBy}
            value={d.isMine ? s.issue.you : (d.reporterName ?? s.issue.aResident)}
          />
          {d.locationText ? <Row label={s.issue.location} value={d.locationText} /> : null}
          {d.assignedDepartmentName ? (
            <Row label={s.issue.department} value={d.assignedDepartmentName} />
          ) : null}
          {d.assignedUserName ? (
            <Row label={s.issue.assignedTo} value={d.assignedUserName} />
          ) : null}
        </Card>

        {workItem && d.iAmAssignee ? (
          <WorkPanel key={workItem.assignmentId} item={workItem} />
        ) : null}

        {message ? <Notice tone="error">{message}</Notice> : null}
        {canSupport ? (
          <Button label={s.issue.affectedButton} busy={busy} onPress={() => void support()} />
        ) : null}

        {(photos.data ?? []).length > 0 ? (
          <>
            <Text style={styles.section}>{s.issue.photos}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photos}
            >
              {(photos.data ?? []).map((p) =>
                p.url ? (
                  <Image
                    key={p.id}
                    source={{ uri: p.url }}
                    style={styles.photo}
                    accessibilityLabel={s.issue.photos}
                  />
                ) : (
                  <View key={p.id} style={[styles.photo, styles.photoMissing]}>
                    <Text style={styles.small}>{s.issue.photoUnavailable}</Text>
                  </View>
                ),
              )}
            </ScrollView>
          </>
        ) : null}

        <Text style={styles.section}>{s.issue.timeline}</Text>
        {timeline.isPending ? (
          <CenteredState loading />
        ) : timeline.isError ? (
          <Notice tone="error">{errorText(timeline.error)}</Notice>
        ) : (
          <View>
            {entries.map((e, i) => {
              const text = timelineText(e, s);
              return (
                <View key={`${e.eventType}-${e.sourceId}`} style={styles.event}>
                  <View style={styles.rail}>
                    <View style={[styles.dot, e.kind === 'status' && styles.dotStatus]} />
                    {i < entries.length - 1 ? <View style={styles.line} /> : null}
                  </View>
                  <View style={styles.eventBody}>
                    <Text style={styles.eventAction}>{text.action}</Text>
                    <Text style={styles.small}>
                      {text.actor} · {formatTimelineTime(e.occurredAt, locale)}
                    </Text>
                    {text.detail ? <Text style={styles.eventDetail}>{text.detail}</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <Text style={styles.section}>{s.issue.comments}</Text>
        {comments.isError ? <Notice tone="error">{errorText(comments.error)}</Notice> : null}
        {(comments.data ?? []).length === 0 && !comments.isPending ? (
          <Body muted>{s.issue.noComments}</Body>
        ) : null}
        {(comments.data ?? []).map((c) => (
          <Card key={c.id}>
            <Text style={styles.small}>
              {actorLabel(
                {
                  isMine: c.isMine,
                  isSystem: false,
                  actorName: c.authorName,
                  actorRoleKey: c.authorRoleKey,
                },
                s,
              )}{' '}
              · {formatTimelineTime(c.createdAt, locale)}
            </Text>
            {c.visibility === 'INTERNAL' ? (
              <Text style={styles.internal}>{s.issue.internalNote}</Text>
            ) : null}
            <Body muted={c.isHidden}>{c.isHidden ? s.issue.commentHidden : (c.body ?? '')}</Body>
          </Card>
        ))}
        {canComment ? (
          <>
            <TextField
              label={s.issue.commentLabel}
              placeholder={s.issue.commentPlaceholder}
              value={comment}
              onChangeText={setComment}
              maxLength={1000}
              multiline
            />
            <Button
              variant="secondary"
              label={s.issue.send}
              busy={busy}
              disabled={comment.trim().length === 0}
              onPress={() => void sendComment()}
            />
          </>
        ) : canSupport ? (
          <Body muted>{s.issue.commentNeedsSupport}</Body>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.small}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.xl, gap: space.md },
  section: { fontSize: 18, fontWeight: '600', color: colors.text, marginTop: space.md },
  photos: { gap: space.sm },
  photo: { width: 160, height: 160, borderRadius: 8, backgroundColor: colors.border },
  photoMissing: { alignItems: 'center', justifyContent: 'center', padding: space.sm },
  small: { fontSize: 13, color: colors.muted },
  internal: { fontSize: 13, fontWeight: '600', color: colors.info },
  infoRow: { gap: 2 },
  infoValue: { fontSize: 16, color: colors.text },
  event: { flexDirection: 'row', gap: space.md },
  rail: { width: 14, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border, marginTop: 6 },
  dotStatus: { backgroundColor: colors.brand },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 },
  eventBody: { flex: 1, paddingBottom: space.lg, gap: 2 },
  eventAction: { fontSize: 16, fontWeight: '500', color: colors.text },
  eventDetail: { fontSize: 15, color: colors.text, marginTop: 2 },
});
