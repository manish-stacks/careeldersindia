import { pathFromUrl } from '@/lib/links';

/**
 * Every incoming URL passes through here first (cold start and while running):
 * custom scheme (parentcare://…), universal/app links (https://parentcare.in/app/…) and short links.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    // expo-router hands us either a full URL or an already-stripped path
    if (/^(parentcare|https?):\/\//i.test(path)) return pathFromUrl(path) ?? '/';
    return pathFromUrl(`parentcare://${path.replace(/^\//, '')}`) ?? path;
  } catch {
    return '/';
  }
}
