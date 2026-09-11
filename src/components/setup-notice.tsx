import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STEPS = [
  'Firebase 콘솔(console.firebase.google.com)에서 새 프로젝트를 만든다.',
  '프로젝트 설정 > 일반 탭에서 웹 앱을 하나 추가하고, 표시되는 firebaseConfig 값을 확인한다.',
  'Authentication에서 이메일/비밀번호 로그인 방식을 사용 설정한다.',
  'Firestore Database와 Storage를 (테스트 모드로) 생성한다.',
  '프로젝트 루트의 .env.example을 .env로 복사하고, firebaseConfig 값을 채워 넣는다.',
  '앱을 다시 시작한다 (npx expo start).',
];

export function SetupNotice() {
  const theme = useTheme();
  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container}>
          <Ionicons name="flame-outline" size={30} color={theme.accent} />
          <ThemedText type="heading" style={styles.title}>
            Firebase 설정이 필요해요
          </ThemedText>
          <ThemedText type="body" color="sub" style={styles.body}>
            DAY 앱은 회원가입, DAY 저장, 사진 업로드에 Firebase를 사용해요. 아직 연결된 프로젝트가 없어서 화면을 시작할
            수 없어요.
          </ThemedText>

          <ThemedView surface="surface" style={[styles.card, { borderColor: theme.line }]}>
            {STEPS.map((step, index) => (
              <ThemedView key={step} surface="surface" style={styles.stepRow}>
                <ThemedView surface="accentSoft" style={styles.badge}>
                  <ThemedText type="caption" color="accentInk" style={styles.badgeText}>
                    {index + 1}
                  </ThemedText>
                </ThemedView>
                <ThemedText type="body" style={styles.stepText}>
                  {step}
                </ThemedText>
              </ThemedView>
            ))}
          </ThemedView>

          <ThemedText type="caption" color="muted" style={styles.footnote}>
            자세한 절차는 프로젝트 루트의 FIREBASE_SETUP.md를 참고하세요.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    marginTop: Spacing.two,
  },
  body: {},
  card: {
    borderWidth: 1,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  stepRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  badge: {
    width: 22,
    height: 22,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
  },
  footnote: {
    marginTop: Spacing.two,
  },
});
