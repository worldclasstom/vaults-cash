import type { PropsWithChildren, ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fonts, radius, space, stickerShadow } from "@/theme";

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

/** A sticker: solid fill, white edge, a small shadow, never quite straight. Outline stickers are quiet facts. */
export function Chip({ children, tone = "outline", rotate = -2 }: PropsWithChildren<{ tone?: "accent" | "yellow" | "outline" | "base" | "robinhood" | "white" | "negative"; rotate?: number }>) {
  const bg =
    tone === "accent" ? colors.accent
    : tone === "yellow" ? colors.stickerYellow
    : tone === "base" ? colors.base
    : tone === "robinhood" ? colors.robinhood
    : tone === "white" ? colors.foreground
    : tone === "negative" ? colors.negative
    : "transparent";
  const fg = tone === "base" || tone === "negative" ? "#fff" : tone === "outline" ? colors.muted : "#000";
  const outline = tone === "outline";
  return (
    <View style={[s.chip, !outline && stickerShadow, { backgroundColor: bg, borderColor: outline ? colors.border : colors.foreground, transform: [{ rotate: `${rotate}deg` }] }]}>
      <Text style={[s.chipText, { color: fg }]}>{children}</Text>
    </View>
  );
}

export function Button({ children, onPress, disabled, tone = "accent", style, left }: PropsWithChildren<{ onPress?: () => void; disabled?: boolean; tone?: "accent" | "ghost" | "white"; style?: StyleProp<ViewStyle>; left?: ReactNode }>) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.btn, tone === "ghost" && s.btnGhost, tone === "white" && s.btnWhite, disabled && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.98 }] }, style]}
    >
      {left}
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
  h1: { color: colors.foreground, fontSize: 30, fontFamily: fonts.display, letterSpacing: -0.6 },
  sub: { color: colors.muted, fontSize: 14, paddingTop: 4, fontFamily: fonts.body },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: space.lg },
  chip: { borderRadius: radius.pill, borderWidth: 2, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" },
  chipText: { fontSize: 11, fontFamily: fonts.display, letterSpacing: 0.2 },
  btn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 15, paddingHorizontal: 24, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  btnGhost: { backgroundColor: colors.surfaceRaised },
  btnWhite: { backgroundColor: colors.foreground },
  btnText: { color: "#000", fontSize: 17, fontFamily: fonts.display },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19, fontFamily: fonts.body },
});
