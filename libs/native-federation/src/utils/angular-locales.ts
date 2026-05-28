import { share, SharedConfig } from '@softarc/native-federation/build';

export function shareAngularLocales(
  keys: string[],
  opts: { config?: SharedConfig; legacy?: boolean } = {},
) {
  if (!opts.config) {
    opts.config = {
      singleton: true,
      strictVersion: true,
      requiredVersion: 'auto',
    };
  }
  // Lift to a local const so the non-undefined narrowing carries into the
  // reduce callback (the closure can't observe the outer-scope assignment).
  const config = opts.config;
  const ext = opts.legacy ? '.mjs' : '.js';
  return keys.reduce<Record<string, SharedConfig>>((acc, key) => {
    acc[`@angular/common/locales/${key}`] = {
      ...config,
      // Locales pin to @angular/common; per-locale `version` and `esm` add no
      // signal at the host side, so the synthesized packageInfo intentionally
      // sets only `entryPoint`. The cast acknowledges the gap between the
      // strict SharedConfig.packageInfo contract (designed for general
      // shareds, where version/esm gate cache hashing and runtime version
      // matching) and the locales corner-case the helper has shipped with
      // since 8dbc749.
      packageInfo:
        config.packageInfo ??
        ({
          entryPoint: `node_modules/@angular/common/locales/${key}${ext}`,
        } as SharedConfig['packageInfo']),
    };
    // share() is declared to return the wider Config (= ConfigObject | (string|ConfigObject)[]);
    // at runtime it always echoes the object map we passed in. Narrow back.
    return share(acc) as Record<string, SharedConfig>;
  }, {});
}
