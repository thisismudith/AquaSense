import { Ionicons } from '@expo/vector-icons';

import { Banner } from '@/components/common/Banner';
import { Card } from '@/components/common/Card';
import { ListRow } from '@/components/common/ListRow';
import { Screen } from '@/components/common/Screen';
import { LANGUAGES, setLanguage, type LanguageCode } from '@/i18n';
import { useAppStore } from '@/store/appStore';
import { useTheme } from '@/theme/ThemeProvider';

/** Screen 38 — Language selection (A14). */
export default function Language() {
  const theme = useTheme();
  const lang = useAppStore((s) => s.settings.language);
  const update = useAppStore((s) => s.updateSetting);
  return (
    <Screen title="Language" back testID="language">
      <Card>
        {(Object.keys(LANGUAGES) as LanguageCode[]).map((code) => (
          <ListRow
            key={code}
            title={LANGUAGES[code].nativeLabel}
            subtitle={LANGUAGES[code].label}
            right={code === lang ? <Ionicons name="checkmark" size={20} color={theme.colors.primary} /> : null}
            onPress={() => {
              setLanguage(code);
              void update('language', code);
            }}
            testID={`lang-${code}`}
          />
        ))}
      </Card>
      <Banner tone="info" message="English is complete. Regional languages can be added as translation files without code changes." />
    </Screen>
  );
}
