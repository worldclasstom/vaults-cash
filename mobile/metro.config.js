// Metro config: the phone app shares src/lib with the web app (../src/lib),
// pins the packages those files import to mobile/node_modules (one viem),
// and works around three packages whose "exports" maps confuse Metro.
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
  return resolve(context, moduleName, platform);
};

module.exports = config;
