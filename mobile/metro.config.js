// Metro config: the phone app shares src/lib with the web app (../src/lib),
// pins the packages those files import to mobile/node_modules (one viem),
// and works around three packages whose "exports" maps confuse Metro.
const fs = require("node:fs");
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const webLib = path.resolve(__dirname, "../src/lib");

config.watchFolders = [...(config.watchFolders ?? []), webLib];
// Files under ../src/lib would otherwise walk up into the web app's
// node_modules and pull a second copy of viem; pin the shared packages here.
const own = (name) => path.resolve(__dirname, "node_modules", name);
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  viem: own("viem"),
  "@uniswap/v4-sdk": own("@uniswap/v4-sdk"),
  "@uniswap/v3-sdk": own("@uniswap/v3-sdk"),
  "@uniswap/sdk-core": own("@uniswap/sdk-core"),
  jsbi: own("jsbi"),
};

const base = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = base ?? context.resolveRequest;
  if (moduleName === "isows" || moduleName.startsWith("zustand")) {
    return resolve({ ...context, unstable_enablePackageExports: false }, moduleName, platform);
  }
  if (moduleName === "jose") {
    return resolve({ ...context, unstable_conditionNames: ["browser"] }, moduleName, platform);
  }
  // Dev-only lazy bundling turns a dynamic import() inside ../src/lib (for
  // example onchain.ts → "./v3core") into a request for "./src/lib/v3core"
  // relative to this project, where no such file exists. Point it back at
  // the shared lib so v3 pools price on the phone in development too.
  const shared = /^\.\/src\/lib\/(.+)$/.exec(moduleName);
  if (shared && !fs.existsSync(path.resolve(__dirname, "src/lib", shared[1] + ".ts"))) {
    return resolve(context, path.join(webLib, shared[1]), platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
