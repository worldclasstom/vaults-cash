// Polyfills first, in this order (Privy + viem need them on Hermes).
import "fast-text-encoding";
import "react-native-get-random-values";
import "@ethersproject/shims";
import { Buffer } from "buffer";
global.Buffer = global.Buffer ?? Buffer;

// The shared web library reads NEXT_PUBLIC_* at call time; Metro only inlines
// EXPO_PUBLIC_*, so bridge the names once before anything imports the lib.
import { bridgeEnv } from "./src/lib/config";
bridgeEnv();

import "expo-router/entry";
