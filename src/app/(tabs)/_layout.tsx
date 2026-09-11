import { Ionicons } from '@expo/vector-icons';
import { router, Tabs, usePathname } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native';

import { FontFamily, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { countUnreadLetterNotifications } from '@/data/notifications';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// react-navigation의 기본 라벨 렌더링은 내부적으로 계산하는 라벨 영역 높이가
// 우리가 지정한 커스텀 폰트(고운돋움)의 line-height와 안 맞아서 글자 아래쪽이
// 잘리는 문제가 있었다. 아이콘+라벨을 tabBarIcon 슬롯 안에서 직접 그려서
// (tabBarShowLabel: false) 그 문제를 근본적으로 피한다.
function TabIcon({
  name,
  label,
  color,
  focused,
}: {
  name: IoniconName;
  label: string;
  color: ColorValue;
  focused: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <Ionicons name={name} size={21} color={color} />
      <Text
        style={[styles.label, { color, fontWeight: focused ? '700' : '400' }]}
        numberOfLines={1}
        allowFontScaling={false}>
        {label}
      </Text>
    </View>
  );
}

// 글쓰기 버튼은 "DAY를 쓰는" 맥락인 월드데이/내 연혁 탭에서만 의미가
// 있다 — 편지함/친구/샵 탭까지 계속 떠 있으면 그 화면들과 전혀 무관한
// 액션이 항상 눈에 밟혀서 오히려 방해가 된다.
const FAB_VISIBLE_PATHS = new Set(['/', '/history']);

export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useLocale();
  const { user } = useAuth();
  const pathname = usePathname();
  const showFab = FAB_VISIBLE_PATHS.has(pathname);

  // 탭 이동이 있을 때마다(=letters.tsx를 나갔다 들어올 때마다) 다시
  // 세서, 편지함에서 읽음 처리를 하면 배지가 곧바로 사라지게 한다. Tabs
  // 레이아웃 자체는 앱을 쓰는 내내 마운트된 채로 있어서 focus 이벤트가
  // 따로 없다 — pathname 변화를 그 대신 신호로 쓴다.
  const [unreadLetters, setUnreadLetters] = useState(0);
  useEffect(() => {
    if (!user) return;
    let active = true;
    countUnreadLetterNotifications(user.uid)
      .then((count) => active && setUnreadLetters(count))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user, pathname]);

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarActiveTintColor: theme.accent,
          tabBarInactiveTintColor: theme.muted,
          tabBarStyle: {
            backgroundColor: theme.surface,
            borderTopColor: theme.line,
            height: Platform.select({ ios: 92, default: 72 }),
            paddingTop: 10,
            paddingBottom: Platform.select({ ios: 30, default: 12 }),
          },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: t('tabs.world'),
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={focused ? 'earth' : 'earth-outline'} label={t('tabs.world')} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: t('tabs.history'),
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={focused ? 'book' : 'book-outline'} label={t('tabs.history')} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="letters"
          options={{
            title: t('tabs.letters'),
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={focused ? 'mail' : 'mail-outline'} label={t('tabs.letters')} color={color} focused={focused} />
            ),
            tabBarBadge: unreadLetters > 0 ? unreadLetters : undefined,
            tabBarBadgeStyle: { backgroundColor: theme.danger, fontSize: 10 },
          }}
        />
        <Tabs.Screen
          name="friends"
          options={{
            title: t('tabs.friends'),
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={focused ? 'people' : 'people-outline'} label={t('tabs.friends')} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="shop"
          options={{
            title: t('tabs.shop'),
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={focused ? 'bag' : 'bag-outline'} label={t('tabs.shop')} color={color} focused={focused} />
            ),
          }}
        />
        {/* 글쓰기는 탭 바 자리를 없애고 아래 원형 버튼(FAB)으로 뺐다 — 탭
            자체는 그대로 두되(href: null) 딥링크/router.push('/write')는
            전부 그대로 동작한다(Expo Router 공식 패턴). */}
        <Tabs.Screen name="write" options={{ href: null }} />
      </Tabs>

      {showFab && (
        <Pressable
          onPress={() => router.push('/write')}
          style={[
            styles.fab,
            {
              backgroundColor: theme.accent,
              bottom: Platform.select({ ios: 96, default: 76 }),
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('tabs.write')}>
          <Ionicons name="create" size={24} color={theme.onAccent} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: Spacing.four,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    overflow: 'visible',
  },
  label: {
    fontFamily: FontFamily.sans,
    fontSize: 10.5,
    lineHeight: 14,
  },
});
