import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/common/AppText';
import { useTheme } from '@/theme/ThemeProvider';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

/** Dropdown: a field that opens a bottom sheet listing the options. */
export function SelectField({
  label,
  value,
  options,
  onChange,
  error,
  testID,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  error?: string | null;
  testID?: string;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  const pick = (v: string) => {
    setOpen(false);
    onChange(v);
  };

  return (
    <View style={styles.root}>
      <AppText variant="label" color="muted">
        {label.toUpperCase()}
      </AppText>
      <Pressable
        accessibilityRole="combobox"
        accessibilityLabel={`${label}: ${current?.label ?? 'not set'}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        testID={testID}
        style={[styles.field, { backgroundColor: t.colors.surface, borderColor: error ? t.colors.danger : t.colors.border, borderRadius: t.radii.md }]}
      >
        <AppText numberOfLines={1} color={current ? 'text' : 'muted'} style={styles.flex}>
          {current?.label ?? 'Select'}
        </AppText>
        <Ionicons name="chevron-down" size={18} color={t.colors.textMuted} />
      </Pressable>
      {error ? (
        <AppText variant="caption" color="danger" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent navigationBarTranslucent>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" testID={testID ? `${testID}-backdrop` : undefined} />
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: t.colors.surface, borderTopLeftRadius: t.radii.xl, borderTopRightRadius: t.radii.xl }]}>
          <View style={[styles.handle, { backgroundColor: t.colors.border }]} />
          <AppText variant="title" style={styles.sheetTitle}>
            {label}
          </AppText>
          <ScrollView>
            {options.map((o) => {
              const selected = o.value === value;
              return (
                <Pressable
                  key={o.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => pick(o.value)}
                  testID={testID ? `${testID}-opt-${o.value}` : undefined}
                  style={({ pressed }) => [styles.option, { backgroundColor: selected ? t.colors.surfaceStrong : pressed ? t.colors.background : 'transparent' }]}
                >
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong" color={selected ? 'primary' : 'text'}>
                      {o.label}
                    </AppText>
                    {o.description ? (
                      <AppText variant="caption" color="muted">
                        {o.description}
                      </AppText>
                    ) : null}
                  </View>
                  {selected ? <Ionicons name="checkmark" size={20} color={t.colors.primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  field: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { maxHeight: '70%', paddingTop: 8, paddingBottom: 12 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 8 },
  sheetTitle: { paddingHorizontal: 20, paddingVertical: 8 },
  option: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
});
