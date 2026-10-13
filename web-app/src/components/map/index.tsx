'use client';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/misc';
export type { MapPoint } from './leaflet-map';
// Leaflet touches `window` on import → client only
export const LiveMap = dynamic(() => import('./leaflet-map'), { ssr: false, loading: () => <Skeleton className="h-[360px] w-full rounded-xl" /> });
