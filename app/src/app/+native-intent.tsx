import { pathFromUrl } from '@/lib/links';

/**
 * Every incoming URL passes through here first (cold start and while running):
 * custom scheme (careeldersindia://…), universal/app links (https://careeldersindia.com/app/…) and short links.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    // expo-router hands us either a full URL or an already-stripped path
    if (/^(careeldersindia|https?):\/\//i.test(path)) return pathFromUrl(path) ?? '/';
    return pathFromUrl(`careeldersindia://${path.replace(/^\//, '')}`) ?? path;
  } catch {
    return '/';
  }
}
