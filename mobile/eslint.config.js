// The web app's config at the repo root ignores mobile/**; this one is the app's own.
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([expoConfig, { ignores: ["ios/**", "android/**", "dist/**", ".expo/**"] }]);
