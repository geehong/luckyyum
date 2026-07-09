module.exports = {
  preset: '@react-native/jest-preset',
  // ssaju는 CJS 빌드가 없는 순수 ESM(.mjs) 패키지라 node_modules 무시 규칙에서 빼줘야 babel이 변환할 수 있다.
  // react-native-mmkv는 __mocks__/react-native-mmkv.js로 완전히 대체하므로 실제로 로드되진 않지만,
  // 혹시 다른 경로로 참조될 경우를 대비해 함께 화이트리스트에 둔다.
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-mmkv|ssaju)/)',
  ],
  // 기본 프리셋의 transform은 .mjs 확장자를 매칭하지 않아서(js|ts|tsx만) ssaju의 .mjs 빌드를 못 읽는다.
  transform: {
    '^.+\\.(js|ts|tsx|mjs)$': 'babel-jest',
    '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp)$': require.resolve(
      '@react-native/jest-preset/jest/assetFileTransformer.js',
    ),
  },
};
