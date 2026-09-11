import { BlackHanSans_400Regular } from '@expo-google-fonts/black-han-sans';
import { DoHyeon_400Regular } from '@expo-google-fonts/do-hyeon';
import { EastSeaDokdo_400Regular } from '@expo-google-fonts/east-sea-dokdo';
import { Gaegu_400Regular, Gaegu_700Bold } from '@expo-google-fonts/gaegu';
import { HiMelody_400Regular } from '@expo-google-fonts/hi-melody';
import { Jua_400Regular } from '@expo-google-fonts/jua';
import { NanumBrushScript_400Regular } from '@expo-google-fonts/nanum-brush-script';
import { NanumGothic_400Regular, NanumGothic_700Bold } from '@expo-google-fonts/nanum-gothic';
import { NanumMyeongjo_400Regular, NanumMyeongjo_700Bold } from '@expo-google-fonts/nanum-myeongjo';
import { NanumPenScript_400Regular } from '@expo-google-fonts/nanum-pen-script';
import { PoorStory_400Regular } from '@expo-google-fonts/poor-story';
import { SongMyung_400Regular } from '@expo-google-fonts/song-myung';
import { useFonts } from 'expo-font';

/**
 * DAY 작성/열람 화면의 글씨체 프리셋(constants/theme.ts의 FONT_PRESETS 중
 * gowun을 뺀 나머지)과 편지지(letter-paper.tsx)에서만 쓰는 손글씨체
 * 15종. 예전엔 이걸 전부 _layout.tsx에서 앱 UI 필수 폰트(FontFamily) 3개와
 * 같이 묶어서 앱을 켤 때마다 통째로 받았는데, 로그인 화면 하나 보려고
 * DAY 손글씨체 12가지를 다 받아야 할 이유가 없다 — 특히 캐시가 안 걸려
 * 있던 배포 설정과 겹쳐서 방문할 때마다 폰트 20개 가까이가 한꺼번에
 * 몰리며 체감 로딩이 크게 늘어지는 원인이었다.
 *
 * 그래서 이 폰트들이 실제로 화면에 보이는 곳(write.tsx, day/[id].tsx,
 * letters/[id].tsx)에서만 이 훅을 부른다. expo-font의 useFonts는 이미
 * 로딩됐거나 로딩 중인 폰트를 다시 요청해도 중복 다운로드하지 않으므로,
 * 여러 화면에서 각자 이 훅을 불러도 안전하다. 반환값으로 렌더링을 막지
 * 않는다 — 로딩되는 동안은 시스템 기본 글씨체로 잠깐 보이다가, 받아지는
 * 대로 자연스럽게 원래 글씨체로 바뀐다(화면 자체를 못 보게 막는 것보다
 * 훨씬 낫다).
 */
export function useDecorativeFonts(): boolean {
  const [loaded] = useFonts({
    NanumGothic_400Regular,
    NanumGothic_700Bold,
    NanumMyeongjo_400Regular,
    NanumMyeongjo_700Bold,
    Jua_400Regular,
    DoHyeon_400Regular,
    BlackHanSans_400Regular,
    Gaegu_400Regular,
    Gaegu_700Bold,
    HiMelody_400Regular,
    PoorStory_400Regular,
    NanumPenScript_400Regular,
    NanumBrushScript_400Regular,
    EastSeaDokdo_400Regular,
    SongMyung_400Regular,
  });
  return loaded;
}
