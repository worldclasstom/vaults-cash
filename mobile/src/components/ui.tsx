import type { PropsWithChildren, ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, space } from "@/theme";

export function Screen({ children, title, sub, right }: PropsWithChildren<{ title: string; sub?: string; right?: ReactNode }>) {
  return (
    <SafeAreaView style={s.screen} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={s.scroll} contentInsetAdjustmentBehavior="automatic">
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.h1}>{title}</Text>
            {sub ? <Text style={s.sub}>{sub}</Text> : null}
          </View>
          {right}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[s.card, style]}>{children}</View>;
}

/** A sticker: the little rotated pill the web app uses for chains and states. */
export function Chip({ children, tone = "outline", rotate = -2 }: PropsWithChildren<{ tone?: "accent" | "yellow" | "outline" | "base" | "robinhood"; rotate?: number }>) {
  const bg = tone === "accent" ? colors.accent : tone === "yellow" ? colors.stickerYellow : tone === "base" ? colors.base : tone === "robinhood" ? colors.robinhood : "transparent";
  const fg = tone === "base" ? "#fff" : tone === "outline" ? colors.muted : "#000";
  return (
    <View style={[s.chip, { backgroundColor: bg, borderColor: tone === "outline" ? colors.border : bg, transform: [{ rotate: `${rotate}deg` }] }]}>
      <Text style={[s.chipText, { color: fg }]}>{children}</Text>
    </View>
  );
}

export function Button({ children, onPress, disabled, tone = "accent", style }: PropsWithChildren<{ onPress?: () => void; disabled?: boolean; tone?: "accent" | "ghost"; style?: StyleProp<ViewStyle> }>) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.btn, tone === "ghost" && s.btnGhost, disabled && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.98 }] }, style]}
    >
      <Text style={[s.btnText, tone === "ghost" && { color: colors.foreground }]}>{children}</Text>
    </Pressable>
  );
}

export function Muted({ children, style }: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}

export function Loading() {
  return (
    <View style={{ paddingVertical: 40 }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: space.lg, paddingBottom: 120, gap: space.md },
  header: { flexDirection: "row", alignItems: "flex-end", gap: space.md, paddingBottom: space.sm },
  h1: { color: colors.foreground, fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  sub: { color: colors.muted, fontSize: 14, paddingTop: 4 },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: space.lg },
  chip: { borderRadius: radius.pill, borderWidth: 2, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" },
  chipText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  btn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 14, paddingHorizontal: 24, alignItems: "center" },
  btnGhost: { backgroundColor: colors.surfaceRaised },
  btnText: { color: "#000", fontSize: 16, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});
