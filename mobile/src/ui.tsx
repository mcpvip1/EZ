import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { ReactNode } from 'react';

export const money = (n: number | undefined | null) =>
  (n ?? 0).toLocaleString('en-US');

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={{ padding: 14, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
      }}
    >
      {children}
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 10 }}>
      {children}
    </Text>
  );
}

export function Sub({ children }: { children: ReactNode }) {
  return (
    <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>
      {children}
    </Text>
  );
}

export function Btn({
  title,
  onPress,
  disabled,
  secondary,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: secondary ? '#e2e8f0' : '#0f172a',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 10,
        alignItems: 'center',
        marginVertical: 4,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          color: secondary ? '#0f172a' : '#fff',
          fontWeight: '700',
          fontSize: 16,
        }}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}

export function Field({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = 'none',
  multiline,
  editable = true,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'number-pad' | 'decimal-pad';
  autoCapitalize?: 'none' | 'characters' | 'words' | 'sentences';
  multiline?: boolean;
  editable?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      multiline={multiline}
      editable={editable}
      style={{
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 10,
        padding: 12,
        backgroundColor: '#fff',
        marginBottom: 8,
        fontSize: 17,
        minHeight: multiline ? 90 : undefined,
        textAlignVertical: multiline ? 'top' : undefined,
      }}
    />
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: selected ? '#0f172a' : '#fff',
        borderWidth: 1,
        borderColor: selected ? '#0f172a' : '#cbd5e1',
        borderRadius: 20,
        paddingVertical: 9,
        paddingHorizontal: 14,
        marginRight: 6,
        marginBottom: 6,
      }}
    >
      <Text
        style={{
          color: selected ? '#fff' : '#0f172a',
          fontWeight: '700',
          fontSize: 15,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
      {children}
    </View>
  );
}
