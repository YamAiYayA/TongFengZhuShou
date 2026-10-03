import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import {
  Card,
  Chip,
  ChipRow,
  Field,
  Label,
  PrimaryButton,
  SecondaryButton,
  Screen,
  Subtitle,
  Title,
} from '../components/ui';
import { useApp } from '../state/AppContext';
import { colors } from '../theme/colors';
import { ensureNotificationPermissions } from '../services/notificationService';
import {
  isKeepAliveRunning,
  openBatteryOptimizationSettings,
  startKeepAlive,
} from '../services/backgroundKeepAlive';
import {
  DEFAULT_QUICK_AMOUNTS,
  DEFAULT_REPEAT_INTERVAL_MINUTES,
} from '../models/types';

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
  const [repeatMinutes, setRepeatMinutes] = useState(
    String(DEFAULT_REPEAT_INTERVAL_MINUTES),
  );
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keepAliveOn, setKeepAliveOn] = useState(false);

  useEffect(() => {
    if (!snapshot) return;
    setGoal(String(snapshot.settings.daily_goal_ml));
    setWake(snapshot.settings.wake_time);
    setCutoff(snapshot.settings.cutoff_time);
    setQuickText(snapshot.quickAmounts.join(','));
    setRepeatMinutes(String(snapshot.settings.repeat_interval_minutes));
    setEnabled(snapshot.settings.notifications_enabled === 1);
    setKeepAliveOn(isKeepAliveRunning());
  }, [snapshot]);

  const onSave = async () => {
    const goalMl = Number(goal);
    const wakeTime = normalizeTime(wake);
    const cutoffTime = normalizeTime(cutoff);
    const repeat = Number(repeatMinutes);
    if (!Number.isFinite(goalMl) || goalMl <= 0) {
      Alert.alert('目标总量无效');
      return;
    }
    if (!wakeTime || !cutoffTime) {
      Alert.alert('时间格式请用 HH:mm，例如 07:00');
      return;
    }
    if (!Number.isFinite(repeat) || repeat < 1 || !Number.isInteger(repeat)) {
      Alert.alert('重复提醒间隔请输入至少 1 的整数分钟');
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
        repeat_interval_minutes: repeat,
      });
      setKeepAliveOn(isKeepAliveRunning());
      Alert.alert(
        '已保存',
        enabled
          ? '设置已更新。后台提醒服务已启动，可在系统「查看后台活动」中看到本应用。'
          : '设置已更新，后台提醒服务已关闭。',
      );
    } catch (e) {
      Alert.alert('保存失败', e instanceof Error ? e.message : '未知错误');
    } finally {
      setSaving(false);
    }
  };

  const onStartKeepAlive = async () => {
    try {
      const ok = await ensureNotificationPermissions();
      if (!ok) {
        Alert.alert('需要通知权限', '后台服务需要常驻通知才能运行。');
        return;
      }
      await startKeepAlive(true);
      setKeepAliveOn(isKeepAliveRunning());
      Alert.alert(
        '后台服务已启动',
        '通知栏会出现「痛风喝水助手」常驻通知；在多任务页点「查看后台活动」应能看到本应用。',
      );
    } catch (e) {
      Alert.alert(
        '启动失败',
        e instanceof Error ? e.message : '无法启动后台服务',
      );
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

          <Label>未操作重复提醒间隔（分钟）</Label>
          <Field
            value={repeatMinutes}
            onChangeText={setRepeatMinutes}
            keyboardType="number-pad"
            placeholder="15"
          />
          <ChipRow>
            {[5, 10, 15, 20, 30, 60].map((m) => (
              <Chip
                key={m}
                label={`${m}分`}
                selected={repeatMinutes === String(m)}
                onPress={() => setRepeatMinutes(String(m))}
              />
            ))}
          </ChipRow>
          <Text style={styles.hint}>
            提醒响了如果你不点「已喝/延后」，也会按这个间隔继续提醒，直到截止时间。
          </Text>

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

        <Card style={{ marginTop: 12 }}>
          <Text style={styles.switchLabel}>后台常驻（小米后台活动）</Text>
          <Text style={styles.hint}>
            开启通知提醒后会自动启动前台服务，应用会出现在系统「查看后台活动」列表，降低被清理导致漏提醒的概率。当前状态：
            {keepAliveOn ? '运行中' : '未运行'}。
          </Text>
          <Text style={styles.hint}>
            建议同时把本应用设为「无限制」省电、允许自启动；否则小米仍可能杀掉后台。
          </Text>
          <PrimaryButton
            label={keepAliveOn ? '重新启动后台服务' : '立即启动后台服务'}
            onPress={() => void onStartKeepAlive()}
          />
          <View style={{ height: 10 }} />
          <SecondaryButton
            label="打开电池优化设置"
            onPress={() => void openBatteryOptimizationSettings()}
          />
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
              Alert.alert('已处理', '已按当前规则重新安排提醒链。'),
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
