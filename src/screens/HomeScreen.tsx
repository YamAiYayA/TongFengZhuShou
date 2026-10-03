import React, { useEffect, useLayoutEffect, useRef } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import {
  Card,
  Chip,
  ChipRow,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Subtitle,
  Title,
} from '../components/ui';
import { WaterCurveChart } from '../components/WaterCurveChart';
import { useApp } from '../state/AppContext';
import { useCountdown } from '../hooks/useCountdown';
import { colors } from '../theme/colors';
import { buildDayCurves } from '../services/waterCurve';
import {
  formatCountdown,
  formatDateTimeHm,
  formatDateTimeHms,
  formatTimeHm,
} from '../utils/datetime';
import { RootStackParamList } from '../navigation/types';
import { ProgressStatus } from '../models/types';

function statusColor(status: ProgressStatus): string {
  switch (status) {
    case 'ahead':
      return colors.statusAhead;
    case 'on_track':
      return colors.statusOnTrack;
    case 'catch_up':
      return colors.statusCatchUp;
    case 'far_behind':
      return colors.statusFar;
    default:
      return colors.statusNeutral;
  }
}

export function HomeScreen() {
  const {
    snapshot,
    loading,
    refresh,
    advanceDueReminders,
    deleteDrink,
    error,
  } = useApp();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const nextReminderAt = snapshot?.progress.nextReminderAt ?? null;
  const countdownSeconds = useCountdown(nextReminderAt);
  const hitZeroRef = useRef(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: '痛风喝水助手' });
  }, [navigation]);

  useEffect(() => {
    if (countdownSeconds == null) {
      hitZeroRef.current = false;
      return;
    }
    if (countdownSeconds > 0) {
      hitZeroRef.current = false;
      return;
    }
    // Countdown hit zero: fire notification + schedule next repeat interval.
    if (!hitZeroRef.current) {
      hitZeroRef.current = true;
      void advanceDueReminders({ presentNotification: true });
    }
  }, [countdownSeconds, advanceDueReminders]);

  if (!snapshot) {
    return (
      <Screen>
        <Title>加载中…</Title>
        {error ? <Subtitle>{error}</Subtitle> : null}
      </Screen>
    );
  }

  const { progress, logs, nextReminder, settings } = snapshot;
  const curves = buildDayCurves({ settings, logs });

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() =>
              void advanceDueReminders({ presentNotification: false }).then(
                () => refresh(),
              )
            }
          />
        }
      >
        <Title>痛风喝水助手</Title>
        <Subtitle>本地记录 · 提醒可同步到小米手环震动</Subtitle>

        <Card style={{ marginTop: 16 }}>
          <Text style={styles.heroAmount}>
            {progress.drunkMl}
            <Text style={styles.heroUnit}> / {progress.goalMl} ml</Text>
          </Text>
          <Text style={styles.remain}>今日余量 {progress.remainingMl} ml</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>时间已过 {progress.timeProgressPct}%</Text>
            <Text style={styles.meta}>水量 {progress.amountProgressPct}%</Text>
          </View>
          <View
            style={[
              styles.statusPill,
              { backgroundColor: statusColor(progress.status) + '22' },
            ]}
          >
            <Text style={[styles.statusText, { color: statusColor(progress.status) }]}>
              {progress.statusLabel}
            </Text>
          </View>
          <Text style={styles.windowText}>
            今日窗口 {formatTimeHm(progress.wakeAt)} – {formatTimeHm(progress.cutoffAt)}
          </Text>
          <Text style={styles.windowText}>
            下次提醒：
            {progress.nextReminderAt
              ? formatDateTimeHms(progress.nextReminderAt)
              : '未安排（记录后可设置，或等起床提醒）'}
          </Text>
          {countdownSeconds != null ? (
            <View style={styles.countdownBox}>
              <Text style={styles.countdownLabel}>距离下次提醒</Text>
              <Text style={styles.countdownValue}>
                {countdownSeconds > 0
                  ? formatCountdown(countdownSeconds)
                  : '时间到'}
              </Text>
              <Text style={styles.countdownHint}>
                未操作将每 {settings.repeat_interval_minutes} 分钟再提醒并通知
              </Text>
            </View>
          ) : null}
        </Card>

        <Card>
          <WaterCurveChart curves={curves} />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>动态间隔对照</Text>
          <Subtitle>按截止前剩余时间与余量重算，不做推荐选择</Subtitle>
          <View style={styles.tableHeader}>
            <Text style={[styles.cell, styles.head]}>间隔</Text>
            <Text style={[styles.cell, styles.head]}>剩余次数</Text>
            <Text style={[styles.cell, styles.head]}>每次约</Text>
          </View>
          {progress.intervals.map((row) => (
            <View key={row.intervalMinutes} style={styles.tableRow}>
              <Text style={styles.cell}>{row.intervalMinutes} 分</Text>
              <Text style={styles.cell}>{row.remainingCount} 次</Text>
              <Text style={styles.cell}>{row.mlPerDrink} ml</Text>
            </View>
          ))}
          {progress.minutesSinceLastDrink != null ? (
            <Text style={[styles.windowText, { marginTop: 10 }]}>
              距上次喝水 {progress.minutesSinceLastDrink} 分钟
            </Text>
          ) : null}
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>快捷操作</Text>
          <PrimaryButton
            label="主动记录喝水"
            onPress={() => navigation.navigate('Record', { source: 'manual' })}
          />
          <View style={{ height: 10 }} />
          <SecondaryButton
            label="打开提醒响应页"
            onPress={() =>
              navigation.navigate('Reminder', {
                reminderJobId: nextReminder?.id,
                kind: nextReminder?.kind ?? 'water',
              })
            }
          />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>今日记录</Text>
          {logs.length === 0 ? (
            <Subtitle>还没有记录。到起床时间会提醒第一杯，也可主动记录。</Subtitle>
          ) : (
            logs.map((log) => (
              <View key={log.id} style={styles.logRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.logAmount}>{log.amount_ml} ml</Text>
                  <Text style={styles.logMeta}>
                    {formatDateTimeHm(new Date(log.drunk_at))} ·{' '}
                    {log.source === 'manual' ? '主动' : '提醒'}
                  </Text>
                </View>
                <ChipRow>
                  <Chip
                    label="改"
                    onPress={() =>
                      navigation.navigate('Record', {
                        source: 'manual',
                        editId: log.id,
                        initialAmount: log.amount_ml,
                      })
                    }
                  />
                  <Chip
                    label="删"
                    onPress={() =>
                      Alert.alert('删除记录', '确认删除这条喝水记录？', [
                        { text: '取消', style: 'cancel' },
                        {
                          text: '删除',
                          style: 'destructive',
                          onPress: () => void deleteDrink(log.id),
                        },
                      ])
                    }
                  />
                </ChipRow>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  heroAmount: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -1,
  },
  heroUnit: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.inkMuted,
  },
  remain: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  meta: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    fontWeight: '700',
    fontSize: 13,
  },
  windowText: {
    marginTop: 8,
    color: colors.inkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  countdownBox: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.bgWarm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  countdownLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkMuted,
  },
  countdownValue: {
    marginTop: 4,
    fontSize: 36,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  countdownHint: {
    marginTop: 6,
    fontSize: 12,
    color: colors.inkMuted,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    marginTop: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  cell: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
  },
  head: {
    color: colors.inkMuted,
    fontWeight: '700',
    fontSize: 12,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  logAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  logMeta: {
    color: colors.inkMuted,
    fontSize: 12,
    marginTop: 2,
  },
});
