// Spotly — shared UI atoms ported from the design (Chip, Btn, Placeholder, Stars).
import React, { useState } from 'react';
import { View, Text, Pressable, Image, ViewStyle, StyleProp } from 'react-native';
import Svg, { Defs, Pattern, Rect, Path } from 'react-native-svg';
import { C, F, R, SH } from '../lib/theme';

export function Chip({
  children,
  active,
  icon,
  color,
  dark,
  style,
  onPress,
}: {
  children: React.ReactNode;
  active?: boolean;
  icon?: React.ReactNode;
  color?: string;
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const bg = active ? color || C.ink : dark ? 'rgba(255,255,255,0.16)' : C.surface;
  const fg = active ? '#fff' : dark ? '#fff' : C.ink;
  return (
    <Pressable
      onPress={onPress}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          height: 34,
          paddingHorizontal: 13,
          borderRadius: R.pill,
          backgroundColor: bg,
          borderWidth: active ? 0 : 1,
          borderColor: dark ? 'rgba(255,255,255,0.18)' : C.line,
        },
        !active && !dark && SH.pill,
        style,
      ]}
    >
      {icon}
      <Text style={{ color: fg, fontFamily: F.semibold, fontSize: 13.5 }}>{children}</Text>
    </Pressable>
  );
}

type BtnKind = 'primary' | 'dark' | 'ghost' | 'soft' | 'sage' | 'premium';
type BtnSize = 'sm' | 'md' | 'lg';

export function Btn({
  children,
  kind = 'primary',
  size = 'md',
  icon,
  style,
  full,
  onPress,
}: {
  children: React.ReactNode;
  kind?: BtnKind;
  size?: BtnSize;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
  onPress?: () => void;
}) {
  const sizes = { sm: { h: 36, px: 14, fs: 13.5 }, md: { h: 48, px: 18, fs: 15 }, lg: { h: 56, px: 22, fs: 16 } }[size];
  const kinds: Record<BtnKind, { bg: string; fg: string; border?: string }> = {
    primary: { bg: C.coral, fg: '#fff' },
    dark: { bg: C.ink, fg: '#fff' },
    ghost: { bg: 'transparent', fg: C.ink, border: C.line },
    soft: { bg: C.coralLt, fg: C.coralDk },
    sage: { bg: C.sage, fg: '#fff' },
    premium: { bg: C.premium, fg: '#fff' },
  };
  const k = kinds[kind];
  const shadow = kind === 'primary' || kind === 'dark' || kind === 'sage' || kind === 'premium';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: sizes.h,
          paddingHorizontal: sizes.px,
          borderRadius: R.pill,
          backgroundColor: k.bg,
          borderWidth: k.border ? 1.5 : 0,
          borderColor: k.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          alignSelf: full ? 'stretch' : 'flex-start',
          opacity: pressed ? 0.9 : 1,
        },
        shadow && SH.cta,
        style,
      ]}
    >
      {icon}
      <Text style={{ color: k.fg, fontFamily: F.bold, fontSize: sizes.fs, letterSpacing: -0.1 }}>{children}</Text>
    </Pressable>
  );
}

// Striped placeholder for images (diagonal repeating stripes via SVG pattern).
export function Placeholder({
  label,
  height = 180,
  tone = 'warm',
  radius = R.lg,
  style,
}: {
  label?: string;
  height?: number;
  tone?: keyof typeof import('../lib/theme').PLACEHOLDER;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  // PLACEHOLDER imported lazily to avoid circular typing issues
  const { PLACEHOLDER } = require('../lib/theme');
  const [a, b] = PLACEHOLDER[tone] || PLACEHOLDER.warm;
  const dark = tone === 'ink';
  return (
    <View style={[{ height, borderRadius: radius, overflow: 'hidden', backgroundColor: a }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={`stripe-${tone}`} patternUnits="userSpaceOnUse" width="40" height="40" patternTransform="rotate(45)">
            <Rect width="40" height="40" fill={a} />
            <Rect width="20" height="40" fill={b} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#stripe-${tone})`} />
      </Svg>
      {label ? (
        <Text
          style={{
            position: 'absolute',
            left: 10,
            bottom: 8,
            fontFamily: F.mono,
            fontSize: 10,
            color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(40,30,20,0.5)',
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}

// Real photo when available, striped placeholder otherwise.
export function SpotImage({
  photoUrl,
  tone = 'warm',
  height = 180,
  radius = R.lg,
  label,
  style,
}: {
  photoUrl?: string;
  tone?: any;
  height?: number;
  radius?: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[{ height, width: '100%', borderRadius: radius, backgroundColor: C.surface2 } as any, style]}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return <Placeholder tone={tone} height={height} radius={radius} label={label} style={style} />;
}

export function Stars({ value = 4.6, size = 12, color = C.coral }: { value?: number | string; size?: number; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z"
          fill={color}
        />
      </Svg>
      <Text style={{ color: C.ink, fontFamily: F.bold, fontSize: size }}>{value}</Text>
    </View>
  );
}

// Frosted circular icon button (used on photo heroes / dark maps).
export function CircBtn({ children, onPress, size = 38 }: { children: React.ReactNode; onPress?: () => void; size?: number }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: 'rgba(255,255,255,0.92)',
          alignItems: 'center',
          justifyContent: 'center',
        },
        SH.pill,
      ]}
    >
      {children}
    </Pressable>
  );
}

// Mono uppercase section label.
export function SectionLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 10 }, style]}>
      <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '700' }}>
        {children}
      </Text>
    </View>
  );
}

// Serif large title header used by Plan / Gallery.
export function TitleHeader({
  title,
  eyebrow,
  right,
  topInset,
}: {
  title: string;
  eyebrow?: string;
  right?: React.ReactNode;
  topInset: number;
}) {
  return (
    <View style={{ paddingTop: topInset + 8, paddingBottom: 14, paddingHorizontal: 20, backgroundColor: C.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View>
          {eyebrow ? <Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.semibold }}>{eyebrow}</Text> : null}
          <Text style={{ fontFamily: F.serif, fontSize: 30, color: C.ink, letterSpacing: -0.6, marginTop: 2 }}>{title}</Text>
        </View>
        {right}
      </View>
    </View>
  );
}

// Pill toggle (on/off) used in onboarding.
export function Switch({ on }: { on?: boolean }) {
  return (
    <View style={{ width: 38, height: 22, borderRadius: 11, backgroundColor: on ? C.coral : C.line, justifyContent: 'center' }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', position: 'absolute', top: 2, right: on ? 2 : undefined, left: on ? undefined : 2 }} />
    </View>
  );
}
