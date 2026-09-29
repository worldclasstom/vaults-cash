import { Tabs } from "expo-router";
import { TabBar } from "@/components/TabBar";
import { colors } from "@/theme";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="targets" />
      <Tabs.Screen name="portfolio" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
