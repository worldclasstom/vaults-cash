/** The web app's bottom tab bar, ported: same four icons (same SVG paths),
 *  the active tab a green sticker pill with a black icon, labels below. */
import { type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { colors } from "@/theme";

type IconProps = { active: boolean; color: string };
const sw = (a: boolean) => (a ? 2.4 : 1.8);

function PoolsIcon({ active, color }: IconProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M3 17l5-6 4 4 6-8" stroke={color} strokeWidth={sw(active)} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M15 7h3v3" stroke={color} strokeWidth={sw(active)} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function TargetIcon({ active, color }: IconProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={sw(active)} />
      <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={sw(active)} />
      <Circle cx={12} cy={12} r={1.2} fill={color} />
    </Svg>
  );
}
function PortfolioIcon({ active, color }: IconProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3a9 9 0 1 0 9 9h-9V3Z" stroke={color} strokeWidth={sw(active)} strokeLinejoin="round" />
      <Path d="M15 3.5A9 9 0 0 1 20.5 9H15V3.5Z" stroke={color} strokeWidth={sw(active)} strokeLinejoin="round" />
    </Svg>
  );
}
function AccountIcon({ active, color }: IconProps) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8.5} r={3.5} stroke={color} strokeWidth={sw(active)} />
      <Path d="M4.5 20a7.5 7.5 0 0 1 15 0" stroke={color} strokeWidth={sw(active)} strokeLinecap="round" />
    </Svg>
  );
}

const TABS: Record<string, { label: string; Icon: (p: IconProps) => React.JSX.Element }> = {
  index: { label: "Pools", Icon: PoolsIcon },
  targets: { label: "Targets", Icon: TargetIcon },
  portfolio: { label: "Portfolio", Icon: PortfolioIcon },
  account: { label: "Account", Icon: AccountIcon },
};

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, i) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const active = state.index === i;
        const { Icon } = tab;
        return (
          <Pressable
            key={route.key}
            onPress={() => {
              const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!active && !e.defaultPrevented) navigation.navigate(route.name);
            }}
            style={s.tab}
            accessibilityRole="button"
            accessibilityState={active ? { selected: true } : {}}
          >
            <View style={[s.pill, active && s.pillActive]}>
              <Icon active={active} color={active ? "#000" : colors.muted} />
            </View>
            <Text style={[s.label, active && { color: colors.foreground }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.background, paddingTop: 8 },
  tab: { flex: 1, alignItems: "center", gap: 2 },
  pill: { height: 28, width: 44, alignItems: "center", justifyContent: "center", borderRadius: 999 },
  pillActive: { backgroundColor: colors.accent, transform: [{ rotate: "-2deg" }] },
  label: { fontSize: 10, fontWeight: "600", color: colors.muted },
});
