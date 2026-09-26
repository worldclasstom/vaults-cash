import { NativeTabs } from "expo-router/unstable-native-tabs";
import { colors } from "@/theme";

export default function TabsLayout() {
  return (
    <NativeTabs backgroundColor={colors.background} indicatorColor={colors.surfaceRaised} labelStyle={{ selected: { color: colors.accent } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Pools</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="drop.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="targets">
        <NativeTabs.Trigger.Label>Targets</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="scope" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="portfolio">
        <NativeTabs.Trigger.Label>Portfolio</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.bar.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
