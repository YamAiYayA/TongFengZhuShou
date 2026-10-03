import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { DayCurves } from '../services/waterCurve';
import { colors } from '../theme/colors';
import { formatTimeHm } from '../utils/datetime';

const WIDTH = 320;
const HEIGHT = 180;
const PAD_L = 40;
const PAD_R = 12;
const PAD_T = 16;
const PAD_B = 28;

function toPath(
  points: { t: number; ml: number }[],
  maxMl: number,
): string {
  if (points.length === 0) return '';
  const innerW = WIDTH - PAD_L - PAD_R;
  const innerH = HEIGHT - PAD_T - PAD_B;
  return points
    .map((p, i) => {
      const x = PAD_L + p.t * innerW;
      const y = PAD_T + innerH - (p.ml / Math.max(1, maxMl)) * innerH;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

export function WaterCurveChart({ curves }: { curves: DayCurves }) {
  const maxMl = Math.max(curves.goalMl, curves.actualNowMl, 1) * 1.05;
  const plannedPath = useMemo(
    () => toPath(curves.planned, maxMl),
    [curves.planned, maxMl],
  );
  const actualPath = useMemo(
    () => toPath(curves.actual, maxMl),
    [curves.actual, maxMl],
  );

  const innerW = WIDTH - PAD_L - PAD_R;
  const innerH = HEIGHT - PAD_T - PAD_B;
  const windowMs = Math.max(1, curves.cutoffAt.getTime() - curves.wakeAt.getTime());
  const nowT = Math.min(
    1,
    Math.max(0, (Date.now() - curves.wakeAt.getTime()) / windowMs),
  );
  const nowX = PAD_L + nowT * innerW;
  const plannedNowY =
    PAD_T + innerH - (curves.plannedNowMl / maxMl) * innerH;
  const actualNowY = PAD_T + innerH - (curves.actualNowMl / maxMl) * innerH;

  const delta = curves.actualNowMl - curves.plannedNowMl;
  const deltaLabel =
    delta >= 0 ? `超前 ${Math.round(delta)} ml` : `落后 ${Math.round(-delta)} ml`;

  return (
    <View>
      <Text style={styles.title}>今日喝水曲线</Text>
      <Text style={styles.subtitle}>
        灰虚线=计划匀速达成 · 绿线=实际累计 · {deltaLabel}
      </Text>
      <View style={styles.chartWrap}>
        <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
          <Rect
            x={PAD_L}
            y={PAD_T}
            width={innerW}
            height={innerH}
            fill={colors.bgWarm}
            rx={8}
          />
          {[0.25, 0.5, 0.75, 1].map((g) => (
            <Line
              key={g}
              x1={PAD_L}
              x2={PAD_L + innerW}
              y1={PAD_T + innerH * (1 - g)}
              y2={PAD_T + innerH * (1 - g)}
              stroke={colors.line}
              strokeWidth={1}
            />
          ))}
          <Path
            d={plannedPath}
            stroke={colors.inkMuted}
            strokeWidth={2}
            fill="none"
            strokeDasharray="6 4"
          />
          <Path
            d={actualPath}
            stroke={colors.primary}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Line
            x1={nowX}
            x2={nowX}
            y1={PAD_T}
            y2={PAD_T + innerH}
            stroke={colors.accent}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <Circle cx={nowX} cy={plannedNowY} r={3.5} fill={colors.inkMuted} />
          <Circle cx={nowX} cy={actualNowY} r={4.5} fill={colors.primary} />
          <SvgText
            x={PAD_L - 6}
            y={PAD_T + 10}
            fill={colors.inkMuted}
            fontSize="10"
            textAnchor="end"
          >
            {Math.round(maxMl)}
          </SvgText>
          <SvgText
            x={PAD_L - 6}
            y={PAD_T + innerH}
            fill={colors.inkMuted}
            fontSize="10"
            textAnchor="end"
          >
            0
          </SvgText>
        </Svg>
      </View>
      <View style={styles.axisRow}>
        <Text style={styles.axisText}>{formatTimeHm(curves.wakeAt)}</Text>
        <Text style={styles.axisText}>现在</Text>
        <Text style={styles.axisText}>{formatTimeHm(curves.cutoffAt)}</Text>
      </View>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: colors.inkMuted }]} />
          <Text style={styles.legendText}>
            计划 {Math.round(curves.plannedNowMl)} ml
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: colors.primary }]} />
          <Text style={styles.legendText}>
            实际 {Math.round(curves.actualNowMl)} ml
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: colors.inkMuted,
    marginBottom: 10,
    lineHeight: 18,
  },
  chartWrap: {
    width: '100%',
    aspectRatio: WIDTH / HEIGHT,
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    paddingHorizontal: 4,
  },
  axisText: {
    fontSize: 11,
    color: colors.inkMuted,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 12,
    color: colors.ink,
    fontWeight: '600',
  },
});
