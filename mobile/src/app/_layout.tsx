import { PrivyProvider } from "@privy-io/expo";
import { SmartWalletsProvider } from "@privy-io/expo/smart-wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, ThemeProvider } from "expo-router";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PRIVY_APP_ID, PRIVY_CLIENT_ID } from "@/lib/config";
import { colors } from "@/theme";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 2, staleTime: 15_000 } } });

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.surface, text: colors.foreground, primary: colors.accent, border: colors.border },
};

export default function RootLayout() {
  return (
    <PrivyProvider appId={PRIVY_APP_ID} clientId={PRIVY_CLIENT_ID}>
      <SmartWalletsProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={theme}>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
              <Stack.Screen name="(tabs)" />
            </Stack>
          </ThemeProvider>
        </QueryClientProvider>
      </SmartWalletsProvider>
    </PrivyProvider>
  );
}
