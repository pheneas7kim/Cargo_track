const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer'), // Use the transformer for SVG files
  },
  resolver: {
    // Add '.svg' as a resolvable extension
    // extensions: ['.svg', '.js', '.ts', '.tsx', '.json'],
    // assetExts: ['bin', 'mp4', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'],
    // sourceExts: ['jsx', 'js', 'ts', 'tsx', 'svg'], // Ensure that SVG is part of sourceExts
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
