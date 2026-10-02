import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import {
  Card,
  Chip,
  ChipRow,
  Field,
  Label,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
} from '../components/ui';
import { useApp } from '../state/AppContext';
import { colors } from '../theme/colors';
import { ensureNotificationPermissions } from '../services/notificationService';
import { DEFAULT_QUICK_AMOUNTS } from '../models/types';

function normalizeTime(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
}

export function SettingsScreen() {
  const { snapshot, saveSettings, scheduleNextReminder } = useApp();
  const [goal, setGoal] = useState('2500');
  const [wake, setWake] = useState('07:00');
  const [cutoff, setCutoff] = useState('21:00');
  const [quickText, setQuickText] = useState(DEFAULT_QUICK_AMOUNTS.join(','));
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!snapshot) return;
    setGoal(String(snapshot.settings.daily_goal_ml));
    setWake(snapshot.settings.wake_time);
    setCutoff(snapshot.settings.cutoff_time);
    setQuickText(snapshot.quickAmounts.join(','));
    setEnabled(snapshot.settings.notifications_enabled === 1);
  }, [snapshot]);

  const onSave = async () => {
    const goalMl = Number(goal);
    const wakeTime = normalizeTime(wake);
    const cutoffTime = normalizeTime(cutoff);
    if (!Number.isFinite(goalMl) || goalMl <= 0) {
      Alert.alert('目标总量无效');
      return;
    }
    if (!wakeTime || !cutoffTime) {
      Alert.alert('时间格式请用 HH:mm，例如 07:00');
      return;
    }
    const amounts = quickText
      .split(/[,，\s]+/)
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x > 0);
    if (amounts.length === 0) {
      Alert.alert('请至少设置一个常用毫升按钮');
      return;
    }

    setSaving(true);
    try {
      if (enabled) {
        const ok = await ensureNotificationPermissions();
        if (!ok) {
          Alert.alert(
            '未获得通知权限',
            '可在系统设置中允许本应用通知，以便手环震动。',
          );
        }
      }
      await saveSettings({
        daily_goal_ml: Math.round(goalMl),
        wake_time: wakeTime,
        cutoff_time: cutoffTime,
        quick_amounts_json: JSON.stringify(amounts),
        notifications_enabled: enabled ? 1 : 0,
      });
      Alert.alert('已保存', '设置已更新，提醒已按新规则重排。');
    } catch (e) {
      Alert.alert('保存失败', e instanceof Error ? e.message : '未知错误');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>设置</Title>
        <Subtitle>第一版存本地 SQLite；表结构按后续 MySQL 同步预留</Subtitle>

        <Card style={{ marginTop: 16 }}>
          <Label>每日目标总量（ml）</Label>
          <Field value={goal} onChangeText={setGoal} keyboardType="number-pad" />

          <Label>起床时间（HH:mm）</Label>
          <Field value={wake} onChangeText={setWake} placeholder="07:00" />
          <Text style={styles.hint}>
            到点后若今日还没有第一杯记录，会发「该喝第一杯水了」通知。
          </Text>

          <Label>睡觉/截止时间（HH:mm）</Label>
          <Field value={cutoff} onChangeText={setCutoff} placeholder="21:00" />
          <Text style={styles.hint}>截止后不再因未达标继续催促。</Text>

          <Label>常用毫升按钮</Label>
          <Field
            value={quickText}
            onChangeText={setQuickText}
            placeholder="100,150,200,250,300"
          />
          <ChipRow>
            {quickText
              .split(/[,，\s]+/)
              .map((x) => Number(x))
              .filter((x) => Number.isFinite(x) && x > 0)
              .map((ml) => (
                <Chip key={ml} label={`${ml}`} onPress={() => undefined} />
              ))}
          </ChipRow>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>系统通知提醒</Text>
              <Text style={styles.hint}>
                开启后可被小米手环同步震动（需手环 App 允许本应用通知）
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ true: colors.primary, false: colors.line }}
            />
          </View>
        </Card>

        <PrimaryButton
          label={saving ? '保存中…' : '保存设置'}
          onPress={() => void onSave()}
          disabled={saving}
        />

        <View style={{ height: 12 }} />
        <PrimaryButton
          label="立即检查并安排提醒"
          onPress={() =>
            void scheduleNextReminder().then(() =>
              Alert.alert('已处理', '若需要第一杯提醒，已重新安排。'),
            )
          }
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  hint: {
    color: colors.inkMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
});
