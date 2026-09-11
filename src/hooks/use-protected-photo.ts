import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/context/auth-context';
import { photoProxyUrl } from '@/utils/photo-url';

export type ProtectedImageSource = { uri: string; headers?: Record<string, string> };

/**
 * DAY 사진 하나를 servePhoto Cloud Function을 통해 인증된 방식으로 불러온다.
 *
 * - 네이티브(iOS/Android)에서는 RN Image가 source.headers를 그대로 지원하니
 *   그냥 프록시 URL과 Authorization 헤더를 얹어서 돌려주면 된다.
 * - 웹에서는 <img src>가 커스텀 헤더를 못 실어 보낸다(브라우저 자체 한계). 그래서
 *   fetch로 직접 인증 요청을 보내 바이트를 받은 뒤 blob URL로 바꿔서 돌려준다.
 *
 * path가 없으면(사진이 없는 DAY) undefined를 반환한다.
 */
export function useProtectedPhoto(path: string | null | undefined): ProtectedImageSource | undefined {
  const { user } = useAuth();
  const [source, setSource] = useState<ProtectedImageSource | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;

    async function load() {
      if (!path || !user) {
        setSource(undefined);
        return;
      }
      try {
        const token = await user.getIdToken();
        const url = photoProxyUrl(path);
        if (Platform.OS === 'web') {
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) throw new Error(`servePhoto ${res.status}`);
          const blob = await res.blob();
          objectUrl = URL.createObjectURL(blob);
          if (!cancelled) setSource({ uri: objectUrl });
        } else {
          if (!cancelled) setSource({ uri: url, headers: { Authorization: `Bearer ${token}` } });
        }
      } catch {
        if (!cancelled) setSource(undefined);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, user]);

  return source;
}
