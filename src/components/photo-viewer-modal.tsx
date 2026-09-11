import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ZoomableImage } from '@/components/zoomable-image';
import { Radius, Spacing } from '@/constants/theme';
import { useLocale } from '@/hooks/use-locale';
import { useProtectedPhoto } from '@/hooks/use-protected-photo';
import { notify } from '@/utils/confirm';
import { savePhotoToDevice } from '@/utils/save-image';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function PhotoViewerItem({ path, onZoomChange }: { path: string; onZoomChange: (zoomed: boolean) => void }) {
  const source = useProtectedPhoto(path);
  return <ZoomableImage source={source} onZoomChange={onZoomChange} />;
}

export function PhotoViewerModal({
  visible,
  photos,
  initialIndex,
  onClose,
}: {
  visible: boolean;
  photos: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // 모달은 열고 닫힐 때 언마운트되지 않고 계속 떠 있으므로(visible로만 토글),
  // 다시 열릴 때마다 어느 사진에서 시작할지/확대·메뉴 상태를 초기화해줘야 한다.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
      setZoomed(false);
      setMenuOpen(false);
    }
  }, [visible, initialIndex]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleSave() {
    setMenuOpen(false);
    setSaving(true);
    try {
      await savePhotoToDevice(photos[index]);
      notify(t('photoViewer.saveDoneTitle'), t('photoViewer.saveDoneMessage'));
    } catch (error) {
      notify(t('photoViewer.saveFailedTitle'), error instanceof Error ? error.message : t('photoViewer.saveFailedGeneric'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent={false}>
      <View style={styles.container}>
        <FlatList
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          data={photos}
          keyExtractor={(uri) => uri}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * i, index: i })}
          onMomentumScrollEnd={(e) => {
            const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
            setIndex(next);
            setZoomed(false);
          }}
          renderItem={({ item }) => <PhotoViewerItem path={item} onZoomChange={setZoomed} />}
        />

        {menuOpen && (
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} />
        )}

        <View style={styles.topBar} pointerEvents="box-none">
          <Pressable style={styles.iconButton} onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>

          {photos.length > 1 && (
            <ThemedText type="caption" style={styles.pageIndicator}>
              {index + 1} / {photos.length}
            </ThemedText>
          )}

          <View>
            <Pressable style={styles.iconButton} onPress={() => setMenuOpen((prev) => !prev)} hitSlop={8}>
              <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
            </Pressable>

            {menuOpen && (
              <View style={styles.menu}>
                <Pressable style={styles.menuItem} onPress={handleSave} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator size="small" color="#1a1a1a" />
                  ) : (
                    <Ionicons name="download-outline" size={16} color="#2B2420" />
                  )}
                  <ThemedText type="body" style={styles.menuItemText}>
                    {t('photoViewer.save')}
                  </ThemedText>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    position: 'absolute',
    top: Spacing.six,
    left: Spacing.four,
    right: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageIndicator: {
    color: '#fff',
  },
  menu: {
    position: 'absolute',
    top: 44,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: Radius.medium,
    paddingVertical: Spacing.one,
    minWidth: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  menuItemText: {
    color: '#2B2420',
  },
});
