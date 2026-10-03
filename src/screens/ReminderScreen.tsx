import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Card,
  Chip,
  ChipRow,
  Label,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Subtitle,
  Title,
} from '../components/ui';
import { SNOOZE_OPTIONS } from '../models/types';
import { useApp } from '../state/AppContext';
import { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';
import { formatTimeHm } from '../utils/datetime';

export function ReminderScreen() {
  const { snapshot, snoozeReminder } = useApp();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Reminder'>>();
  const [snoozeMinutes, setSnoozeMinutes] = useState<number>(10);
  const [saving, setSaving] = useState(false);

  const progress = snapshot?.progress;
  const kind = route.params?.kind ?? 'water';
  const reminderJobId = route.params?.reminderJobId;

  const onSnooze = async () => {
    setSaving(true);
    try {
      await snoozeReminder({ minutes: snoozeMinutes, reminderJobId });
      Alert.alert('已延后', `${snoozeMinutes} 分钟后再提醒`);
      navigation.navigate('Main');
    } catch (e) {
      Alert.alert('延后失败', e instanceof Error ? e.message : '未知错误');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{kind === 'first_cup' ? '该喝第一杯水了' : '该喝水了'}</Title>
        <Subtitle>手环只负责震动通知；选项请在手机上操作</Subtitle>

        <Card style={{ marginTop: 16 }}>
          <Text style={styles.remain}>
            今日余量 {progress?.remainingMl ?? '-'} ml
          </Text>
          <Text style={styles.meta}>
            已喝 {progress?.drunkMl ?? 0} / {progress?.goalMl ?? '-'} ml
          </Text>
          <Text style={styles.meta}>
            距上次喝水{' '}
            {progress?.minutesSinceLastDrink != null
              ? `${progress.minutesSinceLastDrink} 分钟`
              : '尚无记录'}
          </Text>
          <Text style={styles.meta}>
            窗口至 {progress ? formatTimeHm(progress.cutoffAt) : '--:--'}
          </Text>
          <Text style={[styles.meta, { marginTop: 8 }]}>
            状态：{progress?.statusLabel ?? '-'}
          </Text>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>稍等一会儿</Text>
          <Label>延后多久</Label>
          <ChipRow>
            {SNOOZE_OPTIONS.map((m) => (
              <Chip
                key={m}
                label={`${m} 分钟`}
                selected={snoozeMinutes === m}
                onPress={() => setSnoozeMinutes(m)}
              />
            ))}
          </ChipRow>
          <PrimaryButton
            label={saving ? '处理中…' : `延后 ${snoozeMinutes} 分钟`}
            onPress={() => void onSnooze()}
            disabled={saving}
          />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>动态间隔对照</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.cell, styles.head]}>间隔</Text>
            <Text style={[styles.cell, styles.head]}>次数</Text>
            <Text style={[styles.cell, styles.head]}>每次约</Text>
          </View>
          {(progress?.intervals ?? []).map((row) => (
            <View key={row.intervalMinutes} style={styles.tableRow}>
              <Text style={styles.cell}>{row.intervalMinutes} 分</Text>
              <Text style={styles.cell}>{row.remainingCount}</Text>
              <Text style={styles.cell}>{row.mlPerDrink} ml</Text>
            </View>
          ))}
        </Card>

        <PrimaryButton
          label="已经喝了"
          onPress={() =>
            navigation.navigate('Record', {
              source: 'reminder',
              reminderJobId,
            })
          }
        />
        <View style={{ height: 10 }} />
        <SecondaryButton label="返回首页" onPress={() => navigation.navigate('Main')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  remain: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
  },
  meta: {
    marginTop: 6,
    color: colors.inkMuted,
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    marginTop: 10,
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
});
