/** The door: intro slides above, the sign-in tray below. Shown until Privy has a user. */
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Intro } from "@/components/Intro";
import { LoginTray } from "@/components/LoginTray";
import { colors } from "@/theme";

export default function Welcome() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Intro />
        <View style={{ paddingBottom: 8 }}>
          <LoginTray />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
