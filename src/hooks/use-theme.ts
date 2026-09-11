import { useThemeSetting } from '@/context/theme-context';

export function useTheme() {
  return useThemeSetting().theme;
}
