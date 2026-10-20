const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// Watchman's watch-project hangs forever on ~/Desktop (macOS folder privacy
// prompt), so Metro crawls with node fs instead.
module.exports = mergeConfig(getDefaultConfig(__dirname), {
  resolver: {useWatchman: false},
});
