/** The vaults.cash brand mark, same paths as the web's src/app/icon.svg. */
import { Text, View } from "react-native";
import Svg, { G, Path, Rect } from "react-native-svg";
import { colors, fonts } from "@/theme";

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Rect width={64} height={64} rx={14} fill={colors.background} />
      <G rotation={-8} origin="32, 32">
        <Path d="M10 46c14 5 30 5 44 0v5c-14 5-30 5-44 0v-5Z" fill="#3e8f2b" opacity={0.55} />
        <Path d="M10 38c14 5 30 5 44 0v5c-14 5-30 5-44 0v-5Z" fill="#54ad35" opacity={0.8} />
        <Rect x={10} y={14} width={44} height={18} rx={4} fill={colors.accent} />
        <Rect x={16} y={18} width={32} height={10} rx={2} fill={colors.accentDeep} />
        <Rect x={27} y={19.5} width={10} height={7} rx={3} fill={colors.accent} />
      </G>
    </Svg>
  );
}

export function Wordmark({ size = 22, mark = true }: { size?: number; mark?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: size * 0.4 }}>
      {mark && <LogoMark size={size * 1.3} />}
      <Text style={{ fontFamily: fonts.display, fontSize: size, color: colors.foreground, letterSpacing: -0.5 }}>
        vaults<Text style={{ color: colors.accent }}>.cash</Text>
      </Text>
    </View>
  );
}
