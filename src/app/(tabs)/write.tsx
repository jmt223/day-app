import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormField } from '@/components/form-field';
import { FriendPickerModal } from '@/components/friend-picker-modal';
import { FutureDatePickerModal } from '@/components/future-date-picker-modal';
import { PhotoCropModal } from '@/components/photo-crop-modal';
import { PrimaryButton } from '@/components/primary-button';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { moodOptions } from '@/constants/mood';
import { photoAspectOptions, photoAspectRatioValue, type PhotoAspectKey } from '@/constants/photo-aspect';
import { textAlignOptions } from '@/constants/text-align';
import { DEFAULT_FONT_PRESET, FONT_PRESETS, type FontPresetKey, Radius, Spacing } from '@/constants/theme';
import { visibilityOptions } from '@/constants/visibility';
import { useAuth } from '@/context/auth-context';
import { createDay, WriteWindowClosedError } from '@/data/days';
import { listFriends } from '@/data/friends';
import { listFriendGroups } from '@/data/users';
import { useDecorativeFonts } from '@/hooks/use-decorative-fonts';
import { useLocale } from '@/hooks/use-locale';
import { useTheme } from '@/hooks/use-theme';
import type { ContentBlock, DayLocation, DayVisibility, MoodKey, NewDayInput, TextAlignKey } from '@/types/day';
import type { FriendEntry, FriendGroup } from '@/types/user';
import { confirmAsync, notify } from '@/utils/confirm';
import {
  addDaysToLabel,
  formatDayLabelKorean,
  formatRemainingWriteTime,
  isFutureLabel,
  isWritableNow,
  todayKstLabel,
} from '@/utils/date';
import { clearDraft, draftHasContent, loadDraft, saveDraft } from '@/utils/draft-storage';

const MAX_PHOTOS = 3;
type EditorBlock =
  | { id: string; type: 'text'; text: string }
  | {
      id: string;
      type: 'photo';
      /** 지금 화면에 보여줄, 이미 잘라낸 결과. */
      localUri: string;
      /** 다시 자르기용으로 남겨둔 원본(자르기 전) 사진. 이미 자른 결과를
       * 또 자르면 그때마다 화질/구도 선택지가 좁아지니, 다시 자를 땐 항상
       * 이 원본에서 새로 시작한다. */
      originalUri: string;
      originalWidth: number;
      originalHeight: number;
      aspect: PhotoAspectKey;
    };

let blockIdSeq = 0;
function makeBlockId(): string {
  blockIdSeq += 1;
  return `block-${blockIdSeq}-${Date.now()}`;
}

export default function WriteScreen() {
  const theme = useTheme();
  const { t, locale } = useLocale();
  const { user, profile } = useAuth();
  // 글씨체 프리셋 미리보기/고르기에 쓰는 손글씨체들은 이 화면에 들어올
  // 때만 받는다(use-decorative-fonts.ts 참고) — 반환값으로 렌더링을
  // 막지 않고, 받아지는 대로 자연스럽게 해당 글씨체로 바뀐다.
  useDecorativeFonts();
  // Dimensions.get('window')를 모듈 로드 시점에 한 번만 읽으면(특히 웹에서)
  // 실제 뷰포트보다 훨씬 큰/작은 값이 굳어버릴 수 있어서, 화면 크기가 바뀌면
  // 같이 갱신되는 이 훅으로 매 렌더마다 다시 계산한다.
  const { width: windowWidth } = useWindowDimensions();
  const photoWidth = windowWidth - Spacing.four * 2;

  const [dateLabel, setDateLabel] = useState(todayKstLabel());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState<EditorBlock[]>(() => [{ id: makeBlockId(), type: 'text', text: '' }]);
  const [aspectPickerOpen, setAspectPickerOpen] = useState(false);
  const [pendingCrop, setPendingCrop] = useState<{
    uri: string;
    width: number;
    height: number;
    aspect: PhotoAspectKey;
    /** null이면 새 사진 추가, 블록 id가 있으면 그 블록을 다시 자르는 중. */
    editingBlockId: string | null;
  } | null>(null);
  const [mood, setMood] = useState<MoodKey | null>(null);
  const [location, setLocation] = useState<DayLocation | null>(null);
  const [fontKey, setFontKey] = useState<FontPresetKey>(DEFAULT_FONT_PRESET);
  const [textAlign, setTextAlign] = useState<TextAlignKey>('left');
  const [locating, setLocating] = useState(false);
  const [visibility, setVisibility] = useState<DayVisibility>('public');
  const [inWorldFeed, setInWorldFeed] = useState(true);
  const [inHistory, setInHistory] = useState(true);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [taggedUids, setTaggedUids] = useState<string[]>([]);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      listFriendGroups(user.uid).then(setGroups).catch(() => undefined);
      listFriends(user.uid).then(setFriends).catch(() => undefined);
    }, [user])
  );

  // 이 화면이 처음 마운트될 때(앱을 새로 열었거나 새로고침한 뒤) 딱 한 번만
  // 임시저장된 글이 있는지 확인한다 — 탭을 왔다 갔다 해도 이 컴포넌트는
  // 메모리에 계속 떠 있어서(리마운트 안 됨) useFocusEffect가 아니라 마운트
  // 시 1회만 도는 일반 effect로 충분하고, 그래야 이미 쓰고 있던 내용 위에
  // 매번 복구 팝업이 뜨는 일도 없다. 사진은 로컬 경로가 새로고침/재설치를
  // 못 버텨서 복구 대상에서 뺀다.
  useEffect(() => {
    if (!user) return;
    let active = true;
    loadDraft(user.uid).then((draft) => {
      if (!active || !draft || !draftHasContent(draft)) return;
      confirmAsync(
        t('write.restoreDraftTitle'),
        `${t('write.restoreDraftMessage')}${draft.hadPhotos ? t('write.restoreDraftPhotoNote') : ''}`,
        t('write.restoreDraftConfirm')
      ).then((ok) => {
        if (!active) return;
        if (ok) {
          setDateLabel(draft.dateLabel);
          setTitle(draft.title);
          setBlocks(draft.textBlocks.map((text) => ({ id: makeBlockId(), type: 'text', text })));
          setMood(draft.mood);
          setLocation(draft.location);
          setFontKey(draft.fontKey);
          setTextAlign(draft.textAlign);
          setVisibility(draft.visibility);
          setGroupId(draft.groupId);
          setInWorldFeed(draft.inWorldFeed);
          setInHistory(draft.inHistory);
          setTaggedUids(draft.taggedUids);
        } else {
          clearDraft(user.uid);
        }
      });
    });
    return () => {
      active = false;
    };
    // t는 언어가 바뀔 때마다 새 함수 참조가 되는데, 이 effect는 "화면
    // 마운트당 한 번만" 실행돼야 한다(주석 참고) — t를 의존성에 넣으면
    // 언어를 바꾸고 이 화면으로 돌아올 때마다 다시 실행돼서, 이미
    // 불러오기를 선택해 한참 수정한 내용을 임시저장 당시 값으로 되돌리는
    // "복구" 확인창이 또 뜨는 사고가 난다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // 의미 있는 값이 바뀔 때마다(디바운스) 조용히 임시저장한다. 사진은 저장
  // 대상에서 빼되, "사진이 있었다"는 사실만 남겨서 나중에 복구 안내 문구에
  // 반영한다.
  useEffect(() => {
    if (!user) return;
    const timeout = setTimeout(() => {
      const textBlocks = blocks.filter((b): b is Extract<EditorBlock, { type: 'text' }> => b.type === 'text').map((b) => b.text);
      const draft = {
        dateLabel,
        title,
        textBlocks,
        mood,
        location,
        fontKey,
        textAlign,
        visibility,
        groupId,
        inWorldFeed,
        inHistory,
        taggedUids,
        hadPhotos: blocks.some((b) => b.type === 'photo'),
        savedAt: Date.now(),
      };
      if (draftHasContent(draft)) {
        saveDraft(user.uid, draft);
      }
    }, 800);
    return () => clearTimeout(timeout);
  }, [user, dateLabel, title, blocks, mood, location, fontKey, textAlign, visibility, groupId, inWorldFeed, inHistory, taggedUids]);

  const isFuture = isFutureLabel(dateLabel);
  const writable = isFuture || isWritableNow(dateLabel);
  const remaining = formatRemainingWriteTime(dateLabel);

  // 작성 시간 제한(당일 00:00 ~ 다음날 10:00 KST) 때문에, 과거 날짜는 오늘과
  // (아직 마감 전이라면) 어제만 고를 의미가 있다. "내일"은 자주 쓸 것 같아
  // 바로가기로 두고, 그 이후의 미래 날짜는 달력에서 직접 골라야 한다 — 그
  // 날짜가 되면 다음날 오전 10시까지 확정해야 진짜 기록이 된다.
  const dateOptions = useMemo(() => {
    const today = todayKstLabel();
    const yesterday = addDaysToLabel(today, -1);
    const options = [{ key: today, label: t('write.dateToday') }];
    if (isWritableNow(yesterday)) {
      options.push({ key: yesterday, label: t('write.dateYesterday') });
    }
    options.push({ key: addDaysToLabel(today, 1), label: t('write.dateTomorrow') });
    return options;
    // t 자체는 항상 같은 함수 참조라 의존성으로 의미가 없고, 실제로 바뀌는
    //건 locale이다 — 언어가 바뀌면 라벨을 다시 계산해야 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  function toggleTag(uid: string) {
    setTaggedUids((prev) => (prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]));
  }

  const photoCount = blocks.filter((b) => b.type === 'photo').length;

  // expo-image-picker의 allowsEditing/aspect 옵션은 Android에서만 실제로
  // 비율대로 자르고, iOS는 무조건 정사각형으로만 자르며, 웹은 아예 무시한다
  // (라이브러리 자체 제약). 그래서 원본은 그대로 받아오기만 하고, 실제
  // 자르기는 플랫폼 상관없이 항상 똑같이 동작하는 PhotoCropModal에서
  // 손가락으로 직접 하게 한다.
  async function pickPhotoWithAspect(aspect: PhotoAspectKey) {
    setAspectPickerOpen(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify(t('write.photoPermissionTitle'), t('write.photoPermissionMessage'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    setPendingCrop({ uri: asset.uri, width: asset.width, height: asset.height, aspect, editingBlockId: null });
  }

  /** 이미 넣은 사진을 다시 자른다 — 원본(자르기 전)에서 새로 시작해야
   * 화질/구도 선택지가 줄어들지 않는다. */
  function recropBlock(block: Extract<EditorBlock, { type: 'photo' }>) {
    setPendingCrop({
      uri: block.originalUri,
      width: block.originalWidth,
      height: block.originalHeight,
      aspect: block.aspect,
      editingBlockId: block.id,
    });
  }

  function handleCropConfirm(croppedUri: string) {
    if (!pendingCrop) return;
    if (pendingCrop.editingBlockId) {
      const blockId = pendingCrop.editingBlockId;
      setBlocks((prev) => prev.map((b) => (b.id === blockId && b.type === 'photo' ? { ...b, localUri: croppedUri } : b)));
    } else {
      // 사진을 넣은 자리 바로 뒤에 빈 텍스트 칸을 이어붙여서, 계속 그
      // 아래로 이야기를 이어 쓸 수 있게 한다(네이버 블로그처럼 글과
      // 사진이 교차).
      setBlocks((prev) => [
        ...prev,
        {
          id: makeBlockId(),
          type: 'photo',
          localUri: croppedUri,
          originalUri: pendingCrop.uri,
          originalWidth: pendingCrop.width,
          originalHeight: pendingCrop.height,
          aspect: pendingCrop.aspect,
        },
        { id: makeBlockId(), type: 'text', text: '' },
      ]);
    }
    setPendingCrop(null);
  }

  function removePhotoBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }

  function updateTextBlock(id: string, text: string) {
    setBlocks((prev) => prev.map((b) => (b.type === 'text' && b.id === id ? { ...b, text } : b)));
  }

  async function addLocation() {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        notify(t('write.locationPermissionTitle'), t('write.locationPermissionMessage'));
        return;
      }
      const position = await Location.getCurrentPositionAsync({});

      // 웹 브라우저는 좌표는 주지만 역지오코딩(주소 변환)은 지원하지 않는다.
      // 이 경우에도 좌표 자체는 유효하니 실패로 처리하지 않고 이름만 기본값으로 둔다.
      let name = t('write.currentLocationName');
      try {
        const places = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        const place = places[0];
        name = (place && [place.city, place.district, place.name].find(Boolean)) || name;
      } catch {
        // 역지오코딩 실패는 무시하고 기본 이름을 사용한다.
      }

      setLocation({ lat: position.coords.latitude, lng: position.coords.longitude, name });
    } catch {
      notify(t('write.locationFailedTitle'), t('write.locationFailedMessage'));
    } finally {
      setLocating(false);
    }
  }

  const canSubmit =
    !!user &&
    !!profile &&
    title.trim().length > 0 &&
    blocks.some((b) => b.type === 'text' && b.text.trim().length > 0) &&
    writable &&
    !submitting &&
    (visibility !== 'group' || !!groupId);

  async function handleSubmit() {
    if (!user || !profile) return;
    setSubmitting(true);
    try {
      const taggedFriends = friends
        .filter((f) => taggedUids.includes(f.friendUid))
        .map((f) => ({ uid: f.friendUid, nickname: f.nickname }));

      // 편집 화면의 블록 순서를 그대로 유지하면서, 사진 블록은 photoIndex로
      // photoLocalUris/photoAspects의 실제 위치를 가리키게 만든다. 빈
      // 텍스트 블록(사진만 넣고 아무것도 안 쓴 칸)은 저장할 필요가 없어 뺀다.
      const contentBlocks: ContentBlock[] = [];
      const photoLocalUris: string[] = [];
      const photoAspects: PhotoAspectKey[] = [];
      for (const block of blocks) {
        if (block.type === 'text') {
          const trimmed = block.text.trim();
          if (trimmed) contentBlocks.push({ type: 'text', text: trimmed });
        } else {
          contentBlocks.push({ type: 'photo', photoIndex: photoLocalUris.length });
          photoLocalUris.push(block.localUri);
          photoAspects.push(block.aspect);
        }
      }

      const input: NewDayInput = {
        dateLabel,
        title,
        contentBlocks,
        photoLocalUris,
        photoAspects,
        visibility,
        groupId: visibility === 'group' ? groupId : null,
        taggedFriends,
        moodTag: mood,
        location,
        fontKey,
        textAlign,
        inWorldFeed: visibility === 'public' && inWorldFeed,
        inHistory,
      };

      const dayId = await createDay(input, { uid: user.uid, nickname: profile.nickname, photoURL: profile.photoURL });
      await clearDraft(user.uid);

      setTitle('');
      setBlocks([{ id: makeBlockId(), type: 'text', text: '' }]);
      setMood(null);
      setLocation(null);
      setFontKey(DEFAULT_FONT_PRESET);
      setTextAlign('left');
      setTaggedUids([]);
      setVisibility('public');
      setGroupId(null);
      setInWorldFeed(true);
      setInHistory(true);
      setDateLabel(todayKstLabel());

      router.push(`/day/${dayId}`);
    } catch (error) {
      if (error instanceof WriteWindowClosedError) {
        notify(t('write.deadlineTitle'), error.message);
      } else {
        notify(t('common.error'), t('write.submitFailed'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">{t('write.title')}</ThemedText>

          <ThemedView
            surface={writable ? 'accentSoft' : 'card'}
            style={styles.banner}>
            <Ionicons name="time-outline" size={16} color={writable ? theme.accent : theme.danger} />
            <ThemedText type="caption" color={writable ? 'accentInk' : 'danger'} style={styles.bannerText}>
              {isFuture
                ? t('write.bannerFuture')
                : writable
                  ? t('write.bannerRemaining', { remaining: remaining ?? '' })
                  : t('write.bannerClosed')}
            </ThemedText>
          </ThemedView>

          <Step index={1} label={t('write.step1')}>
            <View style={styles.dateChipRow}>
              {dateOptions.map((opt) => {
                const active = opt.key === dateLabel;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setDateLabel(opt.key)}
                    style={[
                      styles.dateChip,
                      active
                        ? { backgroundColor: theme.accent }
                        : { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line },
                    ]}>
                    <Ionicons name="calendar-outline" size={15} color={active ? theme.onAccent : theme.sub} />
                    <ThemedText type="body" color={active ? 'onAccent' : 'ink'}>
                      {opt.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setDatePickerOpen(true)}
                style={[styles.dateChip, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line }]}>
                <Ionicons name="calendar-number-outline" size={15} color={theme.sub} />
                <ThemedText type="body">{t('write.datePickManually')}</ThemedText>
              </Pressable>
            </View>
            <ThemedText type="caption" color="muted" style={styles.dateSubLabel}>
              {formatDayLabelKorean(dateLabel)}
            </ThemedText>
          </Step>

          <Step index={2} label={t('write.step2')}>
            <FormField
              value={title}
              onChangeText={setTitle}
              placeholder={t('write.titlePlaceholder')}
              maxLength={40}
            />
          </Step>

          <Step index={3} label={t('write.step3')}>
            <ThemedText type="caption" color="muted" style={styles.diaryHint}>
              {t('write.diaryHint')}
            </ThemedText>
            <View style={styles.blockList}>
              {blocks.map((block) =>
                block.type === 'text' ? (
                  <FormField
                    key={block.id}
                    value={block.text}
                    onChangeText={(text) => updateTextBlock(block.id, text)}
                    placeholder={t('write.bodyPlaceholder')}
                    multiline
                    numberOfLines={4}
                    fontFamily={FONT_PRESETS[fontKey].sans}
                    style={{ textAlign }}
                  />
                ) : (
                  <View
                    key={block.id}
                    style={[styles.blockPhotoWrap, { width: photoWidth, height: photoWidth / photoAspectRatioValue(block.aspect) }]}>
                    <Pressable onPress={() => recropBlock(block)} style={styles.blockPhotoInner}>
                      <Image
                        source={{ uri: block.localUri }}
                        resizeMode="cover"
                        style={{ width: '100%', height: '100%', borderRadius: Radius.medium }}
                      />
                      <View style={[styles.recropHint, { backgroundColor: 'rgba(0,0,0,0.55)' }]} pointerEvents="none">
                        <Ionicons name="crop-outline" size={12} color="#fff" />
                        <ThemedText type="caption" style={styles.recropHintText}>
                          {t('write.recrop')}
                        </ThemedText>
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => removePhotoBlock(block.id)}
                      style={[styles.photoRemove, { backgroundColor: theme.ink }]}>
                      <Ionicons name="close" size={12} color={theme.background} />
                    </Pressable>
                  </View>
                )
              )}
              {photoCount < MAX_PHOTOS && (
                <Pressable
                  onPress={() => setAspectPickerOpen(true)}
                  style={[styles.addPhotoButton, { borderColor: theme.muted }]}>
                  <Ionicons name="image-outline" size={16} color={theme.sub} />
                  <ThemedText type="caption" color="sub">
                    {t('write.addPhoto', { count: photoCount, max: MAX_PHOTOS })}
                  </ThemedText>
                </Pressable>
              )}
            </View>
          </Step>

          <Step index={4} label={t('write.step4')}>
            <Segmented value={textAlign} onChange={setTextAlign} options={textAlignOptions()} />
          </Step>

          <Step index={5} label={t('write.step5')}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupRow}>
              {(Object.keys(FONT_PRESETS) as FontPresetKey[]).map((key) => {
                const active = fontKey === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setFontKey(key)}
                    style={[
                      styles.fontChip,
                      active
                        ? { backgroundColor: theme.accent }
                        : { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line },
                    ]}>
                    <ThemedText
                      type="body"
                      color={active ? 'onAccent' : 'ink'}
                      style={{ fontFamily: FONT_PRESETS[key].serifBold }}>
                      {FONT_PRESETS[key].label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Step>

          <Step index={6} label={t('write.step6')} optional>
            <View style={styles.moodRow}>
              {moodOptions().map((m) => {
                const active = mood === m.key;
                return (
                  <Pressable key={m.key} onPress={() => setMood(active ? null : m.key)} style={styles.moodItem}>
                    <View
                      style={[
                        styles.moodCircle,
                        { backgroundColor: active ? theme.accentSoft : theme.card },
                        active && { borderWidth: 1.5, borderColor: theme.accent },
                      ]}>
                      <Ionicons name={m.icon} size={20} color={active ? theme.accent : theme.muted} />
                    </View>
                    <ThemedText type="caption" color={active ? 'ink' : 'sub'}>
                      {m.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </Step>

          <Step index={7} label={t('write.step7')} optional>
            {location ? (
              <Pressable
                onPress={() => setLocation(null)}
                style={[styles.locationChip, { backgroundColor: theme.surface, borderColor: theme.line }]}>
                <Ionicons name="location-outline" size={15} color={theme.sub} />
                <ThemedText type="caption">{location.name}</ThemedText>
                <Ionicons name="close" size={14} color={theme.muted} />
              </Pressable>
            ) : (
              <Pressable
                onPress={addLocation}
                disabled={locating}
                style={[styles.locationChip, { backgroundColor: theme.surface, borderColor: theme.line }]}>
                <Ionicons name="location-outline" size={15} color={theme.sub} />
                <ThemedText type="caption" color="sub">
                  {locating ? t('write.locationAdding') : t('write.locationAdd')}
                </ThemedText>
              </Pressable>
            )}
          </Step>

          <Step index={8} label={t('write.step8')}>
            <Segmented value={visibility} onChange={setVisibility} options={visibilityOptions()} />
            {visibility === 'group' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupRow}>
                {groups.length === 0 ? (
                  <ThemedText type="caption" color="muted">
                    {t('write.pickGroupHint')}
                  </ThemedText>
                ) : (
                  groups.map((g) => (
                    <Pressable
                      key={g.id}
                      onPress={() => setGroupId(g.id)}
                      style={[
                        styles.groupChip,
                        groupId === g.id
                          ? { backgroundColor: theme.accent }
                          : { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line },
                      ]}>
                      <ThemedText type="caption" color={groupId === g.id ? 'onAccent' : 'sub'}>
                        {g.name}
                      </ThemedText>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            )}
            {visibility === 'group' && groups.length > 0 && !groupId && (
              <ThemedText type="caption" color="danger" style={styles.groupHint}>
                {t('write.pickGroupWarning')}
              </ThemedText>
            )}
          </Step>

          <Step index={9} label={t('write.step9')}>
            <ThemedText type="caption" color="muted" style={styles.toggleHint}>
              {t('write.toggleHint')}
            </ThemedText>
            {visibility === 'public' && (
              <View style={styles.toggleRow}>
                <ThemedText type="body">{t('write.toggleWorldFeed')}</ThemedText>
                <Switch
                  value={inWorldFeed}
                  onValueChange={setInWorldFeed}
                  trackColor={{ true: theme.accent, false: theme.card }}
                />
              </View>
            )}
            <View style={styles.toggleRow}>
              <ThemedText type="body">{t('write.toggleHistory')}</ThemedText>
              <Switch value={inHistory} onValueChange={setInHistory} trackColor={{ true: theme.accent, false: theme.card }} />
            </View>
          </Step>

          <Step index={10} label={t('write.step10')}>
            {friends.length === 0 ? (
              <ThemedText type="caption" color="muted">
                {t('write.noFriendsHint')}
              </ThemedText>
            ) : (
              <Pressable
                onPress={() => setTagModalOpen(true)}
                style={[styles.tagPickerButton, { backgroundColor: theme.surface, borderColor: theme.line }]}>
                <Ionicons name="people-outline" size={16} color={theme.sub} />
                <ThemedText type="body" color={taggedUids.length > 0 ? 'ink' : 'sub'} style={styles.tagPickerText}>
                  {taggedUids.length > 0
                    ? friends
                        .filter((f) => taggedUids.includes(f.friendUid))
                        .map((f) => f.nickname)
                        .join(', ')
                    : t('write.tagPickerPlaceholder')}
                </ThemedText>
                <Ionicons name="chevron-forward" size={16} color={theme.muted} />
              </Pressable>
            )}
          </Step>

          <PrimaryButton label={t('write.submit')} onPress={handleSubmit} loading={submitting} disabled={!canSubmit} style={styles.submit} />
        </ScrollView>
      </SafeAreaView>

      <FriendPickerModal
        visible={tagModalOpen}
        title={t('dayDetail.together')}
        friends={friends}
        groups={groups}
        selectedUids={taggedUids}
        onToggle={toggleTag}
        onClose={() => setTagModalOpen(false)}
        onConfirm={() => setTagModalOpen(false)}
      />

      <FutureDatePickerModal
        visible={datePickerOpen}
        onSelect={setDateLabel}
        onClose={() => setDatePickerOpen(false)}
      />

      <Modal
        visible={aspectPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setAspectPickerOpen(false)}>
        <View style={styles.aspectBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAspectPickerOpen(false)} />
          <View style={[styles.aspectSheet, { backgroundColor: theme.surface }]}>
            <ThemedText type="label" style={styles.aspectTitle}>
              {t('write.aspectPickerTitle')}
            </ThemedText>
            <View style={styles.aspectOptionRow}>
              {photoAspectOptions().map((opt) => (
                <Pressable
                  key={opt.key}
                  onPress={() => pickPhotoWithAspect(opt.key)}
                  style={styles.aspectOption}>
                  <View
                    style={[
                      styles.aspectPreview,
                      { aspectRatio: opt.ratio[0] / opt.ratio[1], borderColor: theme.line, backgroundColor: theme.card },
                    ]}
                  />
                  <ThemedText type="caption">{opt.label}</ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {pendingCrop && (
        <PhotoCropModal
          imageUri={pendingCrop.uri}
          naturalWidth={pendingCrop.width}
          naturalHeight={pendingCrop.height}
          aspect={pendingCrop.aspect}
          onCancel={() => setPendingCrop(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </ThemedView>
  );
}

function Step({
  index,
  label,
  optional,
  children,
}: {
  index: number;
  label: string;
  optional?: boolean;
  children: ReactNode;
}) {
  const { t } = useLocale();
  return (
    <View style={styles.step}>
      <View style={styles.stepLabelRow}>
        <ThemedView surface="accentSoft" style={styles.badge}>
          <ThemedText type="caption" color="accentInk" style={styles.badgeText}>
            {index}
          </ThemedText>
        </ThemedView>
        <ThemedText type="label">{label}</ThemedText>
        {optional && (
          <ThemedText type="caption" color="muted">
            {t('write.optional')}
          </ThemedText>
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    padding: Spacing.four,
    gap: Spacing.one,
    paddingBottom: Spacing.six,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    marginTop: Spacing.three,
    marginBottom: Spacing.four,
  },
  bannerText: {
    flex: 1,
  },
  step: {
    gap: Spacing.two,
    marginBottom: Spacing.five,
  },
  stepLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
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
  dateChipRow: {
    flexDirection: 'row',
    // 오전 10시 전엔 어제/오늘/내일/직접 선택 4개라 좁은 폰에선 한 줄에 안
    // 들어간다 — 줄을 넘겨서라도 전부 보이게 한다(예전엔 화면 밖으로 잘렸다).
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    borderRadius: Radius.medium,
  },
  dateSubLabel: {
    marginTop: Spacing.one,
  },
  diaryHint: {
    marginBottom: Spacing.one,
  },
  blockList: {
    gap: Spacing.three,
  },
  blockPhotoWrap: {
    alignSelf: 'flex-start',
  },
  blockPhotoInner: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.medium,
    overflow: 'hidden',
  },
  recropHint: {
    position: 'absolute',
    left: Spacing.two,
    bottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  recropHintText: {
    color: '#fff',
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  aspectBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  aspectSheet: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    gap: Spacing.four,
  },
  aspectTitle: {
    textAlign: 'center',
  },
  aspectOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  aspectOption: {
    alignItems: 'center',
    gap: Spacing.two,
    width: 90,
  },
  aspectPreview: {
    width: 72,
    borderWidth: 1.5,
    borderRadius: Radius.small,
  },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.three,
    columnGap: Spacing.three,
  },
  moodItem: {
    alignItems: 'center',
    gap: 5,
  },
  moodCircle: {
    width: 46,
    height: 46,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  groupRow: {
    flexGrow: 0,
    marginTop: Spacing.two,
  },
  groupHint: {
    marginTop: Spacing.two,
  },
  toggleHint: {
    marginBottom: Spacing.one,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
  groupChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    marginRight: Spacing.two,
  },
  fontChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    marginRight: Spacing.two,
  },
  tagPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
  },
  tagPickerText: {
    flex: 1,
  },
  submit: {
    marginTop: Spacing.two,
  },
});
