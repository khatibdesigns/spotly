// Spotly — Metro config.
// Firebase v12 ships its React-Native auth build (with getReactNativePersistence,
// needed to KEEP USERS SIGNED IN) only under the package's "react-native" main
// field. Metro's newer package-exports resolution was picking the browser build
// instead, so auth fell back to in-memory persistence. Disabling package exports
// makes Metro use main-field resolution → the RN build → persistent auth.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
