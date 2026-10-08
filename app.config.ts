import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * App identity (name, slug, bundle ID, scheme) lives in app.json so Expo tooling
 * (`expo install`, `eas init`, `eas update:configure`) can edit it. This file only
 * layers build variants on top, so dev, preview and production builds can be
 * installed side by side on one device.
 *
 * APP_VARIANT is set per build profile in eas.json. Unset means production.
 */
const VARIANTS = {
  development: { nameSuffix: ' (Dev)', idSuffix: '.dev' },
  preview: { nameSuffix: ' (Preview)', idSuffix: '.preview' },
  production: { nameSuffix: '', idSuffix: '' },
} as const;

type Variant = keyof typeof VARIANTS;

function getVariant(): Variant {
  const value = process.env.APP_VARIANT || 'production';
  if (!Object.hasOwn(VARIANTS, value)) {
    throw new Error(
      `APP_VARIANT must be one of ${Object.keys(VARIANTS).join(', ')}; got "${value}"`
    );
  }
  return value as Variant;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = getVariant();
  const { nameSuffix, idSuffix } = VARIANTS[variant];

  const bundleIdentifier = config.ios?.bundleIdentifier;
  const androidPackage = config.android?.package;
  const scheme = config.scheme;
  const { name, slug } = config;
  if (!name || !slug || typeof scheme !== 'string' || !bundleIdentifier || !androidPackage) {
    throw new Error(
      'app.json must set expo.name, expo.slug, expo.scheme, expo.ios.bundleIdentifier and expo.android.package'
    );
  }

  return {
    ...config,
    name: name + nameSuffix,
    slug,
    scheme: variant === 'production' ? scheme : `${scheme}-${variant}`,
    ios: { ...config.ios, bundleIdentifier: bundleIdentifier + idSuffix },
    android: { ...config.android, package: androidPackage + idSuffix },
    extra: { ...config.extra, variant },
  };
};
