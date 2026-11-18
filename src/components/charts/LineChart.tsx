import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { AppText } from '@/components/common/AppText';
import { useTheme } from '@/theme/ThemeProvider';

export interface ChartPoint {
  x: number;
  y: number;
}

/** Pure scaling helper (unit-tested). Returns SVG path for points within the plot box. */
export function buildPath(points: ChartPoint[], w: number, h: number, pad = 0): { d: string; xs: number[]; ys: number[]; minY: number; maxY: number } {
  if (!points.length || w <= 0 || h <= 0) return { d: '', xs: [], ys: [], minY: 0, maxY: 0 };
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  let minY = Math.min(...points.map((p) => p.y));
  let maxY = Math.max(...points.map((p) => p.y));
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  const sx = (x: number) => pad + (maxX === minX ? (w - 2 * pad) / 2 : ((x - minX) / (maxX - minX)) * (w - 2 * pad));
  const sy = (y: number) => h - pad - ((y - minY) / (maxY - minY)) * (h - 2 * pad);
  const xs = points.map((p) => sx(p.x));
  const ys = points.map((p) => sy(p.y));
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(' ');
  return { d, xs, ys, minY, maxY };
}

/** Lightweight SVG line chart (no extra native dependency). Optional dashed reference line (e.g. range max). */
export function LineChart({ points, height = 180, color, reference, formatY = (v) => v.toFixed(3), testID }: { points: ChartPoint[]; height?: number; color?: string; reference?: { y: number; label: string } | null; formatY?: (v: number) => string; testID?: string }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const pad = 16;
  const all = reference ? [...points, { x: points[0]?.x ?? 0, y: reference.y }] : points;
  const { minY, maxY } = buildPath(all, w, height, pad);
  const { d, xs, ys } = buildPath(points, w, height, pad);
  const refY = reference && maxY !== minY ? height - pad - ((reference.y - minY) / (maxY - minY)) * (height - 2 * pad) : null;
  return (
    <View testID={testID} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ height }} accessibilityLabel={`Chart with ${points.length} points`}>
      {points.length < 2 ? (
        <AppText color="muted" align="center" style={{ marginTop: height / 2 - 10 }}>
          Not enough data to plot
        </AppText>
      ) : w > 0 ? (
        <Svg width={w} height={height}>
          <Line x1={pad} x2={w - pad} y1={height - pad} y2={height - pad} stroke={t.colors.border} />
          {refY !== null && reference ? (
            <>
              <Line x1={pad} x2={w - pad} y1={refY} y2={refY} stroke={t.colors.warning} strokeDasharray="4 4" />
              <SvgText x={w - pad} y={refY - 4} fill={t.colors.warning} fontSize={10} textAnchor="end">
                {reference.label}
              </SvgText>
            </>
          ) : null}
          <Path d={d} stroke={color ?? t.colors.primary} strokeWidth={2.5} fill="none" />
          {xs.map((x, i) => (
            <Circle key={i} cx={x} cy={ys[i]} r={3.5} fill={color ?? t.colors.primary} />
          ))}
          <SvgText x={pad} y={pad - 4} fill={t.colors.textMuted} fontSize={10}>
            {formatY(maxY)}
          </SvgText>
          <SvgText x={pad} y={height - 4} fill={t.colors.textMuted} fontSize={10}>
            {formatY(minY)}
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}
