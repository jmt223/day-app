import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { EmptyState } from '@/components/empty-state';
import { LoadingView } from '@/components/loading-view';
import { ReportModal } from '@/components/report-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { blockUser, isBlockedByMe, unblockUser } from '@/data/blocks';
import { isFriend, listFriends } from '@/data/friends';
import { reportContent } from '@/data/reports';
import { sendSummon } from '@/data/summons';
import { getUserProfile } from '@/data/users';
import { useThemeSetting } from '@/context/theme-context';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { TranslationKey } from '@/i18n/translations';
import type { ReportReason, UserProfile } from '@/types/user';
import { confirmAsync, notify } from '@/utils/confirm';

type MenuItem = { key: string; labelKey: TranslationKey; icon: keyof typeof import('@expo/vector-icons/Ionicons').default.glyphMap; href: string };

const MY_MENU: MenuItem[] = [
  { key: 'history', labelKey: 'profile.menu.history', icon: 'book-outline', href: '/(tabs)/history' },
  { key: 'friends', labelKey: 'profile.menu.friends', icon: 'people-outline', href: '/(tabs)/friends' },
  { key: 'liked', labelKey: 'profile.menu.liked', icon: 'heart-outline', href: '/profile/liked' },
  { key: 'comments', labelKey: 'profile.menu.comments', icon: 'chatbubble-ellipses-outline', href: '/profile/comments' },
  { key: 'pets', labelKey: 'profile.menu.pets', icon: 'paw-outline', href: '/pets' },
  { key: 'blocked', labelKey: 'profile.menu.blocked', icon: 'ban-outline', href: '/profile/blocked' },
  { key: 'notifications', labelKey: 'profile.menu.notificationSettings', icon: 'notifications-outline', href: '/profile/notification-settings' },
  { key: 'language', labelKey: 'profile.menu.language', icon: 'language-outline', href: '/profile/language' },
  { key: 'theme', labelKey: 'profile.menu.theme', icon: 'contrast-outline', href: '/profile/theme' },
  { key: 'terms', labelKey: 'profile.menu.terms', icon: 'document-text-outline', href: '/terms' },
  { key: 'privacyPolicy', labelKey: 'profile.menu.privacyPolicy', icon: 'shield-checkmark-outline', href: '/privacy-policy' },
  { key: 'edit', labelKey: 'profile.menu.edit', icon: 'create-outline', href: '/profile/edit' },
];

const LANGUAGE_LABEL_KEY = {
  system: 'language.system',
  ko: 'language.ko',
  en: 'language.en',
} as const;

const THEME_LABEL_KEY = {
  system: 'theme.system',
  light: 'theme.light',
  dark: 'theme.dark',
} as const;

export default function ProfileScreen() {
  const theme = useTheme();
  const { t, localeSetting } = useLocale();
  const { themeSetting } = useThemeSetting();
  const { uid: paramUid } = useLocalSearchParams<{ uid?: string }>();
  const { user, profile: myProfile, signOutUser } = useAuth();

  const isSelf = !paramUid || paramUid === user?.uid;
  const [otherProfile, setOtherProfile] = useState<UserProfile | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [isFriendOfMine, setIsFriendOfMine] = useState(false);
  const [loading, setLoading] = useState(!isSelf);
  const [loadFailed, setLoadFailed] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [summoning, setSummoning] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (isSelf || !paramUid || !user) return;
      let active = true;
      setLoading(true);
      setLoadFailed(false);
      Promise.all([getUserProfile(paramUid), isBlockedByMe(user.uid, paramUid), isFriend(user.uid, paramUid)])
        .then(([p, isBlocked, friend]) => {
          if (!active) return;
          setOtherProfile(p);
          setBlocked(isBlocked);
          setIsFriendOfMine(friend);
        })
        .catch(() => active && setLoadFailed(true))
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [isSelf, paramUid, user])
  );

  // 친구 목록은 본인 것만 읽을 수 있어서(보안 규칙상 다른 사람 friends
  // 서브컬렉션은 열람 불가), 친구 수는 내 프로필을 볼 때만 보여준다.
  useFocusEffect(
    useCallback(() => {
      if (!isSelf || !user) return;
      let active = true;
      listFriends(user.uid)
        .then((list) => active && setFriendCount(list.length))
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [isSelf, user])
  );

  const profile = isSelf ? myProfile : otherProfile;

  async function handleSignOut() {
    const ok = await confirmAsync(t('profile.signOutConfirmTitle'), t('profile.signOutConfirmMessage'), t('profile.signOut'));
    if (ok) signOutUser();
  }

  async function handleToggleBlock() {
    if (!user || !paramUid || !profile) return;
    setBlocking(true);
    try {
      if (blocked) {
        await unblockUser(user.uid, paramUid);
        setBlocked(false);
      } else {
        const ok = await confirmAsync(
          t('profile.blockConfirmTitle'),
          t('profile.blockConfirmMessage', { nickname: profile.nickname }),
          t('profile.block')
        );
        if (!ok) return;
        await blockUser(user.uid, { uid: paramUid, nickname: profile.nickname });
        setBlocked(true);
      }
    } catch {
      notify(t('common.error'), t('profile.blockActionFailed'));
    } finally {
      setBlocking(false);
    }
  }

  async function handleSummon() {
    if (!user || !paramUid || !profile) return;
    setSummoning(true);
    try {
      await sendSummon({ uid: user.uid, nickname: myProfile?.nickname ?? '', photoURL: myProfile?.photoURL ?? null }, paramUid);
      notify(t('profile.summonSentTitle'), t('profile.summonSentMessage', { nickname: profile.nickname }));
    } catch (error) {
      // 24시간 안에 이미 호출했으면 보안 규칙이 거부한다(permission-denied).
      const denied = (error as { code?: string })?.code === 'permission-denied';
      notify(t('common.error'), denied ? t('profile.summonCooldown') : t('profile.summonFailed'));
    } finally {
      setSummoning(false);
    }
  }

  async function handleReport(reason: ReportReason, detail: string) {
    if (!user || !paramUid) return;
    setReporting(true);
    try {
      await reportContent(user.uid, { targetType: 'user', targetId: paramUid, targetAuthorUid: paramUid, reason, detail });
      setReportModalOpen(false);
      notify(t('profile.reportSentTitle'), t('profile.reportSentMessage'));
    } catch {
      notify(t('common.error'), t('profile.reportFailed'));
    } finally {
      setReporting(false);
    }
  }

  if (loading) {
    return <LoadingView />;
  }

  if (!isSelf && (loadFailed || !profile)) {
    return (
      <ThemedView style={styles.flex}>
        <EmptyState icon="person-outline" title={t('profile.notFoundTitle')} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Avatar uri={profile?.photoURL} size={72} />
          <ThemedText type="heading">{profile?.nickname ?? '...'}</ThemedText>
          {!!profile?.bio && (
            <ThemedText type="body" color="sub" style={styles.bio}>
              {profile.bio}
            </ThemedText>
          )}
          <ThemedText type="caption" color="muted">
            {isSelf
              ? t('profile.myDayCount', { count: profile?.dayCount ?? 0 })
              : t('profile.friendDayCount', { nickname: profile?.nickname ?? '', count: profile?.dayCount ?? 0 })}
            {isSelf && friendCount !== null ? t('profile.friendCountSuffix', { count: friendCount }) : ''}
          </ThemedText>
        </View>

        {isSelf ? (
          <View style={[styles.menu, { borderColor: theme.line }]}>
            {MY_MENU.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => router.push(item.href)}
                style={[styles.menuRow, { borderColor: theme.line }]}>
                <View style={styles.menuLeft}>
                  <Ionicons name={item.icon} size={18} color={theme.sub} />
                  <ThemedText type="body">{t(item.labelKey)}</ThemedText>
                </View>
                <View style={styles.menuRight}>
                  {item.key === 'language' && (
                    <ThemedText type="caption" color="muted">
                      {t(LANGUAGE_LABEL_KEY[localeSetting])}
                    </ThemedText>
                  )}
                  {item.key === 'theme' && (
                    <ThemedText type="caption" color="muted">
                      {t(THEME_LABEL_KEY[themeSetting])}
                    </ThemedText>
                  )}
                  <Ionicons name="chevron-forward" size={16} color={theme.muted} />
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={[styles.menu, { borderColor: theme.line }]}>
            <Pressable
              onPress={() => router.push({ pathname: '/(tabs)/history', params: { friendUid: paramUid } })}
              style={[styles.menuRow, { borderColor: theme.line }]}>
              <View style={styles.menuLeft}>
                <Ionicons name="book-outline" size={18} color={theme.sub} />
                <ThemedText type="body">{t('profile.viewHistory')}</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.muted} />
            </Pressable>
            {/* 친구 프로필에서 바로 그 친구와의 편지 대화창으로 — 예전엔 "펫 보내달라고
                하기"만 있고 정작 편지를 쓰려면 편지함으로 돌아가 친구를 다시 골라야 했다. */}
            {isFriendOfMine && (
              <Pressable
                onPress={() => router.push({ pathname: '/letters/with/[uid]', params: { uid: paramUid } })}
                style={[styles.menuRow, { borderColor: theme.line }]}>
                <View style={styles.menuLeft}>
                  <Ionicons name="mail-outline" size={18} color={theme.sub} />
                  <ThemedText type="body">{t('profile.writeLetter')}</ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.muted} />
              </Pressable>
            )}
            {isFriendOfMine && (
              <Pressable onPress={handleSummon} disabled={summoning} style={[styles.menuRow, { borderColor: theme.line }]}>
                <View style={styles.menuLeft}>
                  <Ionicons name="paw-outline" size={18} color={theme.sub} />
                  <ThemedText type="body">{t('profile.requestPet')}</ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.muted} />
              </Pressable>
            )}
            <Pressable onPress={() => setReportModalOpen(true)} style={[styles.menuRow, { borderColor: theme.line }]}>
              <View style={styles.menuLeft}>
                <Ionicons name="flag-outline" size={18} color={theme.sub} />
                <ThemedText type="body">{t('profile.report')}</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.muted} />
            </Pressable>
            <Pressable onPress={handleToggleBlock} disabled={blocking} style={[styles.menuRow, styles.menuRowLast]}>
              <View style={styles.menuLeft}>
                <Ionicons name="ban-outline" size={18} color={theme.danger} />
                <ThemedText type="body" color="danger">
                  {blocked ? t('profile.unblock') : t('profile.block')}
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.muted} />
            </Pressable>
          </View>
        )}

        {isSelf && (
          <Pressable onPress={handleSignOut} style={[styles.signOut, { borderColor: theme.line }]}>
            <ThemedText type="button" color="danger">
              {t('profile.signOut')}
            </ThemedText>
          </Pressable>
        )}
      </ScrollView>

      <ReportModal
        visible={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        onSubmit={handleReport}
        submitting={reporting}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    padding: Spacing.four,
    gap: Spacing.four,
    paddingBottom: Spacing.six,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.four,
  },
  bio: {
    textAlign: 'center',
  },
  menu: {
    borderRadius: Radius.large,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  menuRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  menuRowLast: {
    borderBottomWidth: 0,
  },
  signOut: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
  },
});
