'use client';
import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';

export type MapPoint = { id: string; lat: number; lng: number; kind: 'assistant' | 'home'; label: string; sub?: string; href?: string; stale?: boolean };

const pin = (kind: MapPoint['kind'], stale?: boolean) =>
  L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html:
      kind === 'assistant'
        ? `<span style="display:flex;width:30px;height:30px;border-radius:50%;background:${stale ? '#8A929C' : '#0E5A8A'};border:3px solid #fff;box-shadow:0 2px 8px rgba(31,35,40,.35);align-items:center;justify-content:center;color:#fff;font:600 12px Figtree,sans-serif">&#9679;</span>`
        : `<span style="display:flex;width:26px;height:26px;border-radius:8px;background:#fff;border:2px solid #1F2328;align-items:center;justify-content:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1F2328" stroke-width="2.4"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg></span>`,
  });

function Fit({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const key = points.map((p) => `${p.id}:${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join('|');
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 14);
    else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

export default function LeafletMap({ points, lines = [], height = 360 }: { points: MapPoint[]; lines?: [number, number][][]; height?: number }) {
  const center: [number, number] = points[0] ? [points[0].lat, points[0].lng] : [22.5, 79]; // India
  return (
    <MapContainer center={center} zoom={points.length ? 12 : 5} style={{ height, width: '100%' }} scrollWheelZoom={false}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {lines.map((l, i) => (
        <Polyline key={i} positions={l} pathOptions={{ color: '#0E5A8A', weight: 3, opacity: 0.6, dashArray: '6 6' }} />
      ))}
      {points.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={pin(p.kind, p.stale)}>
          <Popup>
            <strong>{p.label}</strong>
            {p.sub && <div>{p.sub}</div>}
            {p.href && (
              <a href={p.href} style={{ color: '#0E5A8A' }}>
                Open booking
              </a>
            )}
          </Popup>
        </Marker>
      ))}
      <Fit points={points} />
    </MapContainer>
  );
}
