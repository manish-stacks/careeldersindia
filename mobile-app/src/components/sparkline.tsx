import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { C, S } from '@/lib/theme';
import { dateFull } from '@/lib/format';
import { T } from './ui';

type Pt = { value: number; recordedAt: string };

/** Tiny trend chart: last N readings, latest value called out. */
export function Trend({ title, unit, series, second, width = 320, height = 90 }: { title: string; unit: string; series: Pt[]; second?: Pt[]; width?: number; height?: number }) {
  if (!series.length) return null;
  const all = [...series, ...(second || [])].map((p) => p.value);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min || 1) * 0.15;
  const lo = min - pad;
  const hi = max + pad;
  const x = (i: number, n: number) => (n <= 1 ? width / 2 : 8 + (i * (width - 16)) / (n - 1));
  const y = (v: number) => height - 8 - ((v - lo) / (hi - lo)) * (height - 16);
  const path = (s: Pt[]) => s.map((p, i) => `${i ? 'L' : 'M'}${x(i, s.length).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = series[series.length - 1];
  const lastSecond = second?.[second.length - 1];
  return (
    <View style={{ marginBottom: S.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <T v="label">{title}</T>
        <T v="heading">
          {lastSecond ? `${last.value}/${lastSecond.value}` : last.value} <T v="small">{unit}</T>
        </T>
      </View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" accessibilityLabel={`${title} trend over ${series.length} visits`}>
        <Line x1={0} x2={width} y1={height - 1} y2={height - 1} stroke={C.line} strokeWidth={1} />
        {second && <Path d={path(second)} stroke={C.inkSoft} strokeWidth={2} fill="none" />}
        <Path d={path(series)} stroke={C.brand} strokeWidth={2.5} fill="none" />
        {series.map((p, i) => (
          <Circle key={i} cx={x(i, series.length)} cy={y(p.value)} r={i === series.length - 1 ? 4.5 : 3} fill={C.brand} />
        ))}
      </Svg>
      <T v="caption">
        {series.length} reading{series.length > 1 ? 's' : ''} · last on {dateFull(last.recordedAt)}
      </T>
    </View>
  );
}
