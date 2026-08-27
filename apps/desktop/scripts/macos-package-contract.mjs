// @ts-check

export const MACOS_PRODUCT = Object.freeze({
  name: 'GateReeve',
  bundleIdentifier: 'com.trentbrown.gatereeve.desktop',
  architecture: 'universal',
  electronVersion: '43.2.0',
  category: 'public.app-category.developer-tools',
  volumeName: 'GateReeve',
  iconSource: 'assets/branding/gatereeve-rolling-vale.png',
  iconSha256: '7ff177774041fa451edbbaca4e1409f6f46bc782df24cd3ea7345b9f89529cb7',
});

export const ICONSET_ENTRIES = Object.freeze([
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
]);

export const STAGED_DIRECTORIES = Object.freeze([
  'main',
  'preload',
  'renderer',
  'resources',
  'shared',
]);

export const REQUIRED_ASAR_PATHS = Object.freeze([
  '/main/index.js',
  '/preload/index.cjs',
  '/renderer/index.html',
  '/resources/desktop-projection.json',
  '/resources/protocol/context.js',
  '/shared/setup-compatibility.json',
  `/${MACOS_PRODUCT.iconSource}`,
]);

/** @param {string} version */
export function dmgFilename(version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) {
    throw new Error(`Invalid Desktop version: ${version}`);
  }
  return `${MACOS_PRODUCT.name}-${version}-macos-universal.dmg`;
}

/** @param {string} version */
export function stagedPackage(version) {
  return {
    name: '@quality-code/gatereeve-desktop-runtime',
    productName: MACOS_PRODUCT.name,
    version,
    private: true,
    type: 'module',
    main: 'main/index.js',
  };
}

/**
 * @param {{stageRoot: string, outputRoot: string, iconPath: string, version: string}} options
 */
export function electronPackagerOptions(options) {
  return {
    dir: options.stageRoot,
    out: options.outputRoot,
    name: MACOS_PRODUCT.name,
    platform: 'darwin',
    arch: MACOS_PRODUCT.architecture,
    electronVersion: MACOS_PRODUCT.electronVersion,
    appVersion: options.version,
    appBundleId: MACOS_PRODUCT.bundleIdentifier,
    appCategoryType: MACOS_PRODUCT.category,
    icon: options.iconPath,
    asar: true,
    overwrite: true,
    prune: false,
    osxSign: {
      identity: '-',
      identityValidation: false,
      continueOnError: false,
      preAutoEntitlements: false,
      preEmbedProvisioningProfile: false,
      optionsForFile: () => ({ hardenedRuntime: false, timestamp: 'none' }),
    },
  };
}
