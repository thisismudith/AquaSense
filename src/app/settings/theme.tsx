import { Ionicons } from '@expo/vector-icons';

import { Card } from '@/components/common/Card';
import { ListRow } from '@/components/common/ListRow';
import { Screen } from '@/components/common/Screen';
import { useAppStore } from '@/store/appStore';
import { useTheme } from '@/theme/ThemeProvider';

const OPTIONS = [
  { v: 'light', label: 'Light', sub: 'Default' },
  { v: 'dark', label: 'Dark', sub: 'Low light / field at night' },
  { v: 'system', label: 'System', sub: 'Follow Android setting' },
] as const;

/** Screen 39 — Theme selection. */
export default function ThemeScreen() {
  const theme = useTheme();
  const current = useAppStore((s) => s.settings.theme);
  const update = useAppStore((s) => s.updateSetting);
  return (
    <Screen title="Theme" back testID="theme">
      <Card>
        {OPTIONS.map((o) => (
          <ListRow
            key={o.v}
            icon={o.v === 'dark' ? 'moon-outline' : o.v === 'light' ? 'sunny-outline' : 'phone-portrait-outline'}
            title={o.label}
            subtitle={o.sub}
            right={current === o.v ? <Ionicons name="checkmark" size={20} color={theme.colors.primary} /> : null}
            onPress={() => void update('theme', o.v)}
            testID={`theme-${o.v}`}
          />
        ))}
      </Card>
    </Screen>
  );
}
