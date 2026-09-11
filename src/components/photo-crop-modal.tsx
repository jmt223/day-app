import * as ImageManipulator from 'expo-image-manipulator';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { photoAspectRatioValue, type PhotoAspectKey } from '@/constants/photo-aspect';
import { Radius, Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { notify } from '@/utils/confirm';

const MAX_ZOOM = 3;

/**
 * expo-image-picker의 allowsEditing/aspect는 Android에서만 실제로 동작하고
 * (iOS는 무조건 정사각형으로만 자르고, 웹은 아예 무시한다 — 셋 다 라이브러리
 * 자체의 제약), 그래서 플랫폼마다 다르게 동작하거나 아예 안 되는 대신 직접
 * 이 화면에서 손가락으로 옮기고/오므려서 자를 영역을 고르게 한다. 자르기는
 * expo-image-manipulator로 실제 픽셀 단위로 수행해서(단순히 화면에서만
 * 잘라 보이는 게 아니라) 웹/iOS/Android 어디서든 동일하게 동작한다.
 */
export function PhotoCropModal({
  imageUri,
  naturalWidth,
  naturalHeight,
  aspect,
  onCancel,
  onConfirm,
}: {
  imageUri: string;
  naturalWidth: number;
  naturalHeight: number;
  aspect: PhotoAspectKey;
  onCancel: () => void;
  onConfirm: (croppedUri: string) => void;
}) {
  const { t } = useLocale();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [processing, setProcessing] = useState(false);

  const frameWidth = Math.min(windowWidth - Spacing.five * 2, 420, windowHeight * 0.6 * photoAspectRatioValue(aspect));
  const frameHeight = frameWidth / photoAspectRatioValue(aspect);

  // width/height를 시스템이 못 준 극히 드문 경우를 대비한 안전값.
  const safeNaturalWidth = naturalWidth || frameWidth;
  const safeNaturalHeight = naturalHeight || frameHeight;

  // 확대(zoom) 없이도 이미지가 프레임을 빈틈없이 덮는 배율.
  const coverScale = Math.max(frameWidth / safeNaturalWidth, frameHeight / safeNaturalHeight);
  const baseWidth = safeNaturalWidth * coverScale;
  const baseHeight = safeNaturalHeight * coverScale;

  const zoom = useSharedValue(1);
  const savedZoom = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  function clampValue(value: number, limit: number) {
    'worklet';
    return Math.min(Math.max(value, -limit), limit);
  }

  function maxOffset(currentZoom: number) {
    'worklet';
    const dispW = baseWidth * currentZoom;
    const dispH = baseHeight * currentZoom;
    return { x: Math.max(0, (dispW - frameWidth) / 2), y: Math.max(0, (dispH - frameHeight) / 2) };
  }

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      zoom.value = Math.min(Math.max(savedZoom.value * e.scale, 1), MAX_ZOOM);
      const limit = maxOffset(zoom.value);
      translateX.value = clampValue(translateX.value, limit.x);
      translateY.value = clampValue(translateY.value, limit.y);
    })
    .onEnd(() => {
      savedZoom.value = zoom.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      const limit = maxOffset(zoom.value);
      translateX.value = clampValue(savedTranslateX.value + e.translationX, limit.x);
      translateY.value = clampValue(savedTranslateY.value + e.translationY, limit.y);
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: zoom.value }],
  }));

  async function handleConfirm() {
    setProcessing(true);
    try {
      const totalScale = coverScale * zoom.value;
      const dispW = safeNaturalWidth * totalScale;
      const dispH = safeNaturalHeight * totalScale;
      // 프레임(자를 영역)을, 지금 화면에 그려진 이미지 기준 좌표로 옮긴 뒤
      // totalScale로 나눠서 원본 사진의 실제 픽셀 좌표로 바꾼다.
      const localX0 = dispW / 2 - frameWidth / 2 - translateX.value;
      const localY0 = dispH / 2 - frameHeight / 2 - translateY.value;
      const cropWidth = frameWidth / totalScale;
      const cropHeight = frameHeight / totalScale;
      const originX = Math.min(Math.max(localX0 / totalScale, 0), Math.max(0, safeNaturalWidth - cropWidth));
      const originY = Math.min(Math.max(localY0 / totalScale, 0), Math.max(0, safeNaturalHeight - cropHeight));

      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX: Math.round(originX),
              originY: Math.round(originY),
              width: Math.round(cropWidth),
              height: Math.round(cropHeight),
            },
          },
        ],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );
      onConfirm(result.uri);
    } catch {
      notify(t('common.error'), t('photoCrop.failed'));
    } finally {
      setProcessing(false);
    }
  }

  return (
    <Modal visible animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.container}>
        <Text style={styles.title}>{t('photoCrop.instruction')}</Text>

        <GestureDetector gesture={composedGesture}>
          <View style={[styles.frame, { width: frameWidth, height: frameHeight }]}>
            <Animated.Image
              source={{ uri: imageUri }}
              style={[
                {
                  position: 'absolute',
                  width: baseWidth,
                  height: baseHeight,
                  left: (frameWidth - baseWidth) / 2,
                  top: (frameHeight - baseHeight) / 2,
                },
                animatedStyle,
              ]}
            />
          </View>
        </GestureDetector>

        <View style={styles.actions}>
          <Pressable style={[styles.actionButton, styles.cancelButton]} onPress={onCancel} disabled={processing}>
            <Text style={styles.cancelText}>{t('photoCrop.cancel')}</Text>
          </Pressable>
          <Pressable style={[styles.actionButton, styles.confirmButton]} onPress={handleConfirm} disabled={processing}>
            {processing ? <ActivityIndicator color="#1a1a1a" /> : <Text style={styles.confirmText}>{t('photoCrop.confirm')}</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.five,
    padding: Spacing.four,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  frame: {
    overflow: 'hidden',
    borderRadius: Radius.medium,
    backgroundColor: '#111',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
    width: '100%',
    maxWidth: 420,
  },
  actionButton: {
    flex: 1,
    paddingVertical: Spacing.three,
    borderRadius: Radius.large,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  cancelText: {
    color: '#fff',
    fontWeight: '700',
  },
  confirmButton: {
    backgroundColor: '#fff',
  },
  confirmText: {
    color: '#1a1a1a',
    fontWeight: '700',
  },
});
