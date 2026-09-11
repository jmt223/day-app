import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import { formatYearMonth, getMonthGrid, nowAsKstWallClock, todayKstLabel, weekdayLabels } from '@/utils/date';

/**
 * 미래 날짜를 하루하루 골라야 하는 화면(연혁 작성 시 "예정된 DAY")에서 쓰는
 * 달력 모달. `@react-native-community/datetimepicker`는 웹을 아예 지원 안 해서
 * (이 프로젝트 초반에 확인하고 제거함), 기존 history.tsx의 달력 그리드
 * 로직을 재사용해 직접 만들었다. 오늘 이전(오늘 포함) 날짜는 선택 불가 —
 * 그 범위는 오늘/어제 버튼이 이미 담당한다.
 */
export function FutureDatePickerModal({
  visible,
  onSelect,
  onClose,
}: {
  visible: boolean;
  onSelect: (label: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { t } = useLocale();
  const now = nowAsKstWallClock();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);

  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);
  const todayLabel = todayKstLabel();

  function goToMonth(delta: number) {
    let nextMonth = month + delta;
    let nextYear = year;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setMonth(nextMonth);
    setYear(nextYear);
  }

  function handleSelect(label: string) {
    onSelect(label);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <SafeAreaView edges={['bottom']}>
            <ThemedText type="label">{t('futureDatePicker.title')}</ThemedText>
            <ThemedText type="caption" color="muted" style={styles.hint}>
              {t('futureDatePicker.hint')}
            </ThemedText>

            <View style={styles.monthNav}>
              <Pressable onPress={() => goToMonth(-1)} hitSlop={8}>
                <Ionicons name="chevron-back" size={18} color={theme.sub} />
              </Pressable>
              <ThemedText type="label">{formatYearMonth(year, month)}</ThemedText>
              <Pressable onPress={() => goToMonth(1)} hitSlop={8}>
                <Ionicons name="chevron-forward" size={18} color={theme.sub} />
              </Pressable>
            </View>

            <View style={styles.weekdayRow}>
              {weekdayLabels().map((w) => (
                <ThemedText key={w} type="caption" color="muted" style={styles.weekdayCell}>
                  {w}
                </ThemedText>
              ))}
            </View>

            <View style={styles.grid}>
              {grid.map((cell, index) => {
                if (!cell.label) {
                  return <View key={index} style={styles.dayCell} />;
                }
                const isPastOrToday = cell.label <= todayLabel;
                return (
                  <Pressable
                    key={cell.label}
                    disabled={isPastOrToday}
                    onPress={() => handleSelect(cell.label!)}
                    style={styles.dayCell}>
                    <ThemedText type="caption" color={isPastOrToday ? 'muted' : 'ink'}>
                      {cell.day}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    padding: Spacing.four,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    gap: Spacing.two,
  },
  hint: {
    marginBottom: Spacing.one,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayCell: {
    flex: 1,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.small,
  },
});
