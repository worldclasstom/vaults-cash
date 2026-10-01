import { PrivyProvider, usePrivy } from "@privy-io/expo";
import { SmartWalletsProvider } from "@privy-io/expo/smart-wallets";
import { PrivyElements } from "@privy-io/expo/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { PRIVY_APP_ID, PRIVY_CLIENT_ID } from "@/lib/config";
import { colors, fontFiles } from "@/theme";

// Hold the native splash until fonts are in and Privy knows whether someone is signed in,
// so the app opens straight onto the right screen with no second loading state.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 220 });

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 2, staleTime: 15_000 } } });

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.surface, text: colors.foreground, primary: colors.accent, border: colors.border },
};

/** Signed out → the welcome door. Signed in → the tabs. Nothing else is reachable. */
function Gate() {
  const { isReady, user } = usePrivy();
  const [fontsLoaded] = useFonts(fontFiles);
  const ready = isReady && fontsLoaded;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="welcome" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <PrivyProvider appId={PRIVY_APP_ID} clientId={PRIVY_CLIENT_ID}>
      <SmartWalletsProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={theme}>
            <StatusBar style="light" />
            <Gate />
            <PrivyElements config={{ appearance: { colorScheme: "dark", accentColor: colors.accent } }} />
          </ThemeProvider>
        </QueryClientProvider>
      </SmartWalletsProvider>
    </PrivyProvider>
  );
}
