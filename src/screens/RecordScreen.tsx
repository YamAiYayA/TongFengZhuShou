import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Card,
  Chip,
  ChipRow,
  Field,
  Label,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Subtitle,
  Title,
} from '../components/ui';
import { AGO_OPTIONS, NEXT_REMIND_OPTIONS } from '../models/types';
import { useApp } from '../state/AppContext';
import { RootStackParamList } from '../navigation/types';
import { colors } from '../theme/colors';

export function RecordScreen() {
  const { snapshot, recordDrink, editDrink } = useApp();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Record'>>();

  const editId = route.params?.editId;
  const source = route.params?.source ?? 'manual';
  const reminderJobId = route.params?.reminderJobId;

  const [amountText, setAmountText] = useState(
    String(route.params?.initialAmount ?? snapshot?.quickAmounts[0] ?? 200),
  );
  const [minutesAgo, setMinutesAgo] = useState(0);
  const [nextRemind, setNextRemind] = useState<number | null>(30);
  const [saving, setSaving] = useState(false);

  const quickAmounts = snapshot?.quickAmounts ?? [];
  const isEdit = editId != null;

  const title = useMemo(
    () => (isEdit ? '修改喝水记录' : '记录喝水'),
    [isEdit],
  );

  const onSave = async () => {
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('请输入有效毫升数');
      return;
    }
    setSaving(true);
    try {
      if (isEdit && editId != null) {
        await editDrink(editId, { amountMl: amount, minutesAgo });
      } else {
        await recordDrink({
          amountMl: amount,
          minutesAgo,
          source,
          nextRemindInMinutes: nextRemind,
          reminderJobId,
        });
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('保存失败', e instanceof Error ? e.message : '未知错误');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{title}</Title>
        <Subtitle>
          {isEdit
            ? '修改后会按新数据重算今日进度'
            : '主动记录也会进入同一套动态计算'}
        </Subtitle>

        <Card style={{ marginTop: 16 }}>
          <Label>喝了多少（ml）</Label>
          <Field
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="number-pad"
            placeholder="例如 200"
          />
          <Label>常用量</Label>
          <ChipRow>
            {quickAmounts.map((ml) => (
              <Chip
                key={ml}
                label={`${ml}`}
                selected={amountText === String(ml)}
                onPress={() => setAmountText(String(ml))}
              />
            ))}
          </ChipRow>

          <Label>多久之前喝的</Label>
          <ChipRow>
            {AGO_OPTIONS.map((opt) => (
              <Chip
                key={opt.minutes}
                label={opt.label}
                selected={minutesAgo === opt.minutes}
                onPress={() => setMinutesAgo(opt.minutes)}
              />
            ))}
          </ChipRow>

          {!isEdit ? (
            <>
              <Label>下次提醒（分钟后）</Label>
              <ChipRow>
                <Chip
                  label="不设置"
                  selected={nextRemind == null}
                  onPress={() => setNextRemind(null)}
                />
                {NEXT_REMIND_OPTIONS.map((m) => (
                  <Chip
                    key={m}
                    label={`${m}`}
                    selected={nextRemind === m}
                    onPress={() => setNextRemind(m)}
                  />
                ))}
              </ChipRow>
              <Text style={styles.hint}>
                截止时间后不会再催未达标。未设置则只保留必要的起床第一杯逻辑。
              </Text>
            </>
          ) : null}
        </Card>

        <PrimaryButton
          label={saving ? '保存中…' : '保存'}
          onPress={() => void onSave()}
          disabled={saving}
        />
        <View style={{ height: 10 }} />
        <SecondaryButton label="取消" onPress={() => navigation.goBack()} />
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
    marginTop: 4,
    color: colors.inkMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
