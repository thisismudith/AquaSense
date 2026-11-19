import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { useTheme } from '@/theme/ThemeProvider';

/** 'YYYY-MM-DD' ↔ local calendar date (no time-zone shift). */
export function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Tappable date field that opens the native calendar picker. Value is 'YYYY-MM-DD' or ''. */
export function DateField({
  label,
  value,
  onChange,
  error,
  hint,
  minimumDate,
  testID,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  error?: string | null;
  hint?: string;
  minimumDate?: Date;
  testID?: string;
}) {
  const t = useTheme();
  const [iosOpen, setIosOpen] = useState(false);
  const current = parseIsoDate(value);
  const shown = current ? current.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Select a date';

  const handle = (e: DateTimePickerEvent, d?: Date) => {
    setIosOpen(false);
    if (e.type === 'set' && d) onChange(toIsoDate(d));
  };

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: current ?? new Date(), mode: 'date', onChange: handle, minimumDate });
    } else setIosOpen(true);
  };

  return (
    <View style={styles.root}>
      <AppText variant="label" color="muted">
        {label.toUpperCase()}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current ? shown : 'not set'}`}
        accessibilityHint="Opens a calendar"
        onPress={open}
        testID={testID}
        style={[styles.input, { backgroundColor: t.colors.surface, borderColor: error ? t.colors.danger : t.colors.border, borderRadius: t.radii.md }]}
      >
        <AppText color={current ? 'text' : 'muted'} style={styles.flex}>
          {shown}
        </AppText>
        <Ionicons name="calendar-outline" size={20} color={t.colors.primary} />
      </Pressable>
      {iosOpen ? <DateTimePicker value={current ?? new Date()} mode="date" display="inline" onChange={handle} minimumDate={minimumDate} /> : null}
      {error ? (
        <AppText variant="caption" color="danger" accessibilityRole="alert">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
});
