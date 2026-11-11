import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { LoadingView } from '@/components/loading-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth-context';
import { getLetter } from '@/data/letters';
import { useLocale } from '@/hooks/use-locale';

/**
 * 편지 한 통으로 바로 오는 길(알림/푸시를 눌렀을 때 letterId로 들어옴). 편지는
 * 이제 친구별 대화창에 모여 있어서, 이 편지의 상대를 찾아 그 대화창으로
 * 넘겨준다(해당 편지는 강조 표시).
 */
export default function LetterRedirectScreen() {
  const { t } = useLocale();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    let active = true;
    getLetter(id)
      .then((letter) => {
        if (!active) return;
        if (!letter) {
          setMissing(true);
          return;
        }
        const otherUid = letter.fromUid === user.uid ? letter.toUid : letter.fromUid;
        router.replace({ pathname: '/letters/with/[uid]', params: { uid: otherUid, focus: id } });
      })
      .catch(() => active && setMissing(true));
    return () => {
      active = false;
    };
  }, [user, id]);

  if (missing) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="body" color="sub">
          {t('letters.notFound')}
        </ThemedText>
      </ThemedView>
    );
  }
  return <LoadingView />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
