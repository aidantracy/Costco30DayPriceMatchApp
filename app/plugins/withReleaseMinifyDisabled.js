// Turns off R8 for release builds. Expo SDK 58 enables it by default, and the minified
// build broke the receipt-text native module (NullPointerException in
// ReceiptText.recognize). The app is sideloaded, so APK size doesn't matter much.
const { withGradleProperties } = require('expo/config-plugins');

const KEY = 'android.enableMinifyInReleaseBuilds';

module.exports = function withReleaseMinifyDisabled(config) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter(
      (item) => !(item.type === 'property' && item.key === KEY),
    );
    cfg.modResults.push({ type: 'property', key: KEY, value: 'false' });
    return cfg;
  });
};
