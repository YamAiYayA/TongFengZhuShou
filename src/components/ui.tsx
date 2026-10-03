import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { colors } from '../theme/colors';

export function Screen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primaryBtn,
        (pressed || disabled) && { opacity: 0.7 },
      ]}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryBtn,
        danger && { borderColor: colors.danger },
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={[styles.secondaryBtnText, danger && { color: colors.danger }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

export function Field({
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'number-pad';
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.inkMuted}
      keyboardType={keyboardType}
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: colors.inkMuted,
    marginTop: 4,
    lineHeight: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkMuted,
    marginBottom: 8,
    marginTop: 4,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  secondaryBtnText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  chip: {
    backgroundColor: colors.chip,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  chipSelected: {
    backgroundColor: colors.chipActive,
  },
  chipText: {
    color: colors.ink,
    fontWeight: '600',
    fontSize: 13,
  },
  chipTextSelected: {
    color: '#fff',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FBFDFA',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    marginBottom: 10,
  },
});
