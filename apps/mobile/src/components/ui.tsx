import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, space } from './theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.title} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Body({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  busy = false,
  disabled = false,
  variant = 'primary',
  busyLabel,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'link';
  busyLabel?: string;
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'link' && styles.buttonLink,
        inactive && variant !== 'link' && styles.buttonDisabled,
        pressed && styles.pressed,
      ]}
    >
      {busy && variant !== 'link' ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.brand} />
      ) : null}
      <Text
        style={[
          styles.buttonText,
          variant === 'primary' ? styles.buttonTextPrimary : styles.buttonTextOther,
          inactive && variant === 'link' && styles.muted,
        ]}
      >
        {busy && busyLabel ? busyLabel : label}
      </Text>
    </Pressable>
  );
}

export function TextField({
  label,
  error,
  prefix,
  ...input
}: TextInputProps & { label: string; error?: string | undefined; prefix?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, error ? styles.inputError : null]}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          {...input}
          accessibilityLabel={label}
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
      </View>
      {error ? (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Notice({ tone, children }: { tone: 'error' | 'info'; children: ReactNode }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.notice, tone === 'error' ? styles.noticeError : styles.noticeInfo]}
    >
      <Text style={{ color: tone === 'error' ? colors.danger : colors.info }}>{children}</Text>
    </View>
  );
}

export function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function CenteredState({
  title,
  body,
  action,
  loading = false,
}: {
  title?: string;
  body?: string;
  action?: ReactNode;
  loading?: boolean;
}) {
  return (
    <View style={styles.centered}>
      {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}
      {title ? <Text style={[styles.title, styles.center]}>{title}</Text> : null}
      {body ? <Text style={[styles.body, styles.muted, styles.center]}>{body}</Text> : null}
      {action}
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.xl, gap: space.lg },
  fill: { flex: 1 },
  title: { fontSize: 24, fontWeight: '600', color: colors.text },
  body: { fontSize: 16, lineHeight: 24, color: colors.text },
  muted: { color: colors.muted },
  center: { textAlign: 'center' },
  button: {
    minHeight: 48,
    borderRadius: 8,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonPrimary: { backgroundColor: colors.brand },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  buttonLink: { minHeight: 40, paddingHorizontal: 0 },
  buttonDisabled: { opacity: 0.6 },
  pressed: { opacity: 0.8 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  buttonTextPrimary: { color: '#fff' },
  buttonTextOther: { color: colors.brand },
  field: { gap: space.xs },
  label: { fontSize: 14, fontWeight: '500', color: colors.text },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
  },
  inputError: { borderColor: colors.danger },
  prefix: { fontSize: 18, color: colors.muted, marginRight: space.sm },
  input: { flex: 1, fontSize: 18, color: colors.text, paddingVertical: space.sm },
  errorText: { color: colors.danger, fontSize: 14 },
  notice: { borderRadius: 8, padding: space.md, borderWidth: 1 },
  noticeError: { backgroundColor: colors.dangerSoft, borderColor: '#fecdca' },
  noticeInfo: { backgroundColor: colors.infoSoft, borderColor: '#b9e6fe' },
  choice: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
  },
  choiceSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  choiceText: { fontSize: 16, color: colors.text },
  choiceTextSelected: { color: colors.brandDark, fontWeight: '600' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    gap: space.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: space.lg,
    gap: space.sm,
    borderWidth: 1,
    borderColor: '#e7e7e2',
  },
});
