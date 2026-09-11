import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { updateNotificationSettings } from '@/data/users';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from '@/types/user';
import { notify } from '@/utils/confirm';
import type { TranslationKey } from '@/i18n/translations';

const ROWS: { key: keyof NotificationSettings; labelKey: TranslationKey; descriptionKey: TranslationKey }[] = [
  { key: 'tag', labelKey: 'notificationSettings.tagLabel', descriptionKey: 'notificationSettings.tagDescription' },
  { key: 'comment', labelKey: 'notificationSettings.commentLabel', descriptionKey: 'notificationSettings.commentDescription' },
  { key: 'like', labelKey: 'notificationSettings.likeLabel', descriptionKey: 'notificationSettings.likeDescription' },
  { key: 'friend', labelKey: 'notificationSettings.friendLabel', descriptionKey: 'notificationSettings.friendDescription' },
  { key: 'memory', labelKey: 'notificationSettings.memoryLabel', descriptionKey: 'notificationSettings.memoryDescription' },
  { key: 'letter', labelKey: 'notificationSettings.letterLabel', descriptionKey: 'notificationSettings.letterDescription' },
];

export default function NotificationSettingsScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>({
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...profile?.notificationSettings,
  });
  const [saving, setSaving] = useState<keyof NotificationSettings | null>(null);

  async function handleToggle(key: keyof NotificationSettings, value: boolean) {
    if (!user) return;
    const next = { ...settings, [key]: value };
    setSettings(next);
    setSaving(key);
    try {
      await updateNotificationSettings(user.uid, next);
    } catch {
      setSettings(settings);
      notify(t('common.error'), t('notificationSettings.saveFailed'));
    } finally {
      setSaving(null);
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="caption" color="muted">
          {t('notificationSettings.hint')}
        </ThemedText>

        <View style={[styles.list, { borderColor: theme.line }]}>
          {ROWS.map((row, index) => (
            <View key={row.key} style={[styles.row, index < ROWS.length - 1 && { borderBottomWidth: 1, borderColor: theme.line }]}>
              <View style={styles.rowText}>
                <ThemedText type="body">{t(row.labelKey)}</ThemedText>
                <ThemedText type="caption" color="sub">
                  {t(row.descriptionKey)}
                </ThemedText>
              </View>
              <Switch
                value={settings[row.key]}
                onValueChange={(value) => handleToggle(row.key, value)}
                disabled={saving === row.key}
                trackColor={{ true: theme.accent, false: theme.card }}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  list: {
    borderRadius: Radius.large,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
});
