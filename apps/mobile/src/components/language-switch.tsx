import { StyleSheet, View } from 'react-native';
import { LANGUAGES } from '@mana/core';
import { useI18n } from '@/i18n/i18n-provider';
import { Choice } from './ui';
import { space } from './theme';

export function LanguageSwitch({
  onChange,
}: {
  onChange?: (language: (typeof LANGUAGES)[number]) => void;
}) {
  const { language, setLanguage, s } = useI18n();
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={s.language.label}>
      {LANGUAGES.map((l) => (
        <View key={l} style={styles.item}>
          <Choice
            label={s.language[l]}
            selected={language === l}
            onPress={() => {
              setLanguage(l);
              onChange?.(l);
            }}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  item: { flex: 1 },
});
