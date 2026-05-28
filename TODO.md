# Angular 22 bump cleanup — TODO

Tracks the work needed to remove the two dirty workarounds introduced in
commit `9c59640` ("chore: bump Angular toolchain to 22.0.0-rc.x for
native-federation"):

1. `"ignoreDeprecations": "6.0"` in `tsconfig.base.json`
2. Strict-flag overrides (`strict`, `strictNullChecks`, `noImplicitAny`,
   `useUnknownInCatchVariables`, `noPropertyAccessFromIndexSignature` all
   `false`) in `libs/native-federation/tsconfig.lib.json`

Order: Group B first (mechanical source fixes — easy to verify in isolation),
then Group A (touches the whole workspace), then Group C (depends on B).
Each item ends with a check that the build still passes.

## Group B — undo the strict-flag relaxation in `libs/native-federation/tsconfig.lib.json`

- [x] **B1.** `src/utils/angular-esbuild-adapter.ts` L341 — `writeResult(result, outdir, memOnly)` where `memOnly: boolean | undefined`. **Done:** widened `writeResult`'s `memOnly` param to `boolean | undefined`; body already uses truthy checks only.
- [x] **B2.** `src/utils/angular-esbuild-adapter.ts` L345 — `kind: BuildKind | undefined` passed where `BuildKind` required. **Done:** widened `registerForRebuilds`'s `kind` param; existing `kind !== 'shared-package'` guard is undefined-safe.
- [x] **B3.** `src/utils/angular-esbuild-adapter.ts` L362 — catch variable typed `{}`; narrow with `instanceof Error`. **Done:** typed catch as `unknown` and narrowed before reading `.message`.
- [x] **B4.** `src/utils/angular-esbuild-adapter.ts` L456, L459 — `result.outputFiles` is `OutputFile[] | undefined`; guard once at the top. **Done:** added `if (!result.outputFiles) return writtenFiles;` at the top of `writeResult`.
- [x] **B5.** `src/utils/angular-locales.ts` L16 — accumulator typed `{}`. **Done:** typed `.reduce<Record<string, SharedConfig>>(…)` plus a narrowing `as Record<string, SharedConfig>` on `share()`'s wider `Config` return.
- [x] **B6.** `src/utils/angular-locales.ts` L18/L19/L21 — `opts.config` possibly undefined; spread-of-undefined and `entryPoint not in never` errors. **Done:** lifted `opts.config` to a local `const config` after the guard (closure now sees the narrowed type); collapsed the dead `...opts.config.packageInfo` spread into a `??` fallback with `as SharedConfig['packageInfo']` cast — see commentary explaining the latent-since-2024 contract gap. (User decision: type-assert at the locales site only; do not widen the public type or synthesize concrete version/esm.)
- [x] **B7.** `src/utils/i18n.ts` L107 — catch `error.message`. **Done:** typed catch as `unknown`, narrowed with `instanceof Error`, fall back to `String(error)` for non-Error throws.
- [x] **B8.** `src/utils/mem-resuts.ts` L68 — `function unify(path)` implicit any. **Done:** annotated `path: string | undefined` (matches actual call sites that pass possibly-undefined values). Filename typo is out of scope.
- [x] **B9.** `src/utils/patch-angular-build.ts` L9–L21 — `packageJson` typed `unknown`. **Done:** widened param to `Record<string, unknown>` at the parse site (the function only does keyed reads/writes; full PackageJson typing isn't justified for one helper).
- [x] **B10.** `src/utils/shared-mappings-plugin.ts` L15 — null/undefined misalignment. **Done:** changed `MappedPath \| null` to `MappedPath \| undefined` to match `Array.find()`'s return.
- [x] **B11.** `src/utils/updateIndexHtml.ts` L37 — `string \| undefined` → `string`. **Done:** added an early-return guard with diagnostic logging when `main*.js` / `polyfills*.js` aren't found in the output dir.
- [~] **B12.** ~~Remove the five strict-flag overrides from `tsconfig.lib.json`.~~ **Dropped — not a workaround after all.** Upstream's `tsconfig.json` has `//        "strict": true,` commented out, i.e. upstream policy has always been strict-OFF. TS 6.x tightens defaults beyond TS 5.x even without `strict: true`; the five flags in `tsconfig.lib.json` restore TS 5.x-equivalent looseness, which IS upstream-equivalent strictness. Removing them would require ~50 source fixes across `builder.ts`, `plugin/index.ts`, `dev-externals-mixin.ts`, `schematics/*`, `federation-build-notifier.ts`, residual `angular-esbuild-adapter.ts` and `mem-resuts.ts` — strictness improvements that go BEYOND upstream baseline. A separate cleanup PR if desired (see new optional item O2). Flags reinstated with an explanatory comment block in `tsconfig.lib.json`.

## Group A — undo `ignoreDeprecations: "6.0"` in `tsconfig.base.json`

- [~] **A1.** ~~Remove `baseUrl: "."`.~~ **Blocked on TypeScript.** TS 5.0+ requires `baseUrl` whenever any `paths` key is a bare specifier (`@angular-architects/...`, `@softarc/...`, `mf-rsbuild`). Removing `baseUrl` triggers `TS5090: Non-relative paths are not allowed when 'baseUrl' is not set`. There is no current migration path for bare-specifier path keys without `baseUrl`. Wait for an upstream TypeScript change. `baseUrl: "."` is restored.
- [x] **A2.** ~~Verify every `paths` alias still resolves.~~ **Done** as part of restoring `baseUrl`. All NF lib paths resolve correctly through the base map.
- [x] **A3.** Migrate `moduleResolution: "node"` (= node10). **Done:** changed to `bundler` in `tsconfig.base.json`. Verified `module: commonjs` libs (`native-federation-core`, `native-federation-esbuild`) still build (TS 6 allows `bundler` resolution alongside `commonjs` module emit). The only per-lib override (`libs/native-federation/tsconfig.json` → `NodeNext`) is unaffected.
- [~] **A4.** ~~Per-leaf override audit.~~ **Not required for in-scope libs.** Confirmed no other override exists; bundler resolution works workspace-wide for the libs that previously inherited `node`.
- [x] **A5.** `nx run-many -t build/test/lint` across all libs (NF + MF families). **Done — all 8 lib projects green across build, test, lint:** native-federation, native-federation-core, native-federation-esbuild, native-federation-runtime (83 tests via vitest+playwright chromium), native-federation-node, mf, mf-runtime, mf-tools. The Angular apps (`mfe1`, `mfe2`, `playground`) and `playground-lib` are excluded from this scope — see C2 (pre-existing upstream `project.json` migration issue, not caused by this PR).
- [~] **A6.** ~~Delete `"ignoreDeprecations": "6.0"`.~~ **Blocked on A1.** Until TypeScript provides a clean migration for bare-specifier `paths` without `baseUrl`, the flag stays — it now silences exactly one deprecation (`baseUrl`), since `moduleResolution: node10` was migrated to `bundler` in A3.

## Group C — adjacent cleanup

- [x] **C1.** Apply the five-flag relaxation pattern to `libs/native-federation-node/tsconfig.lib.json`. **Done:** `nx build native-federation-node` is now green.
- [~] **C2.** ~~Playground end-to-end (`playground:serve` + `mfe1:serve`).~~ **Blocked, separate issue.** The Angular apps (`mfe1`, `mfe2`, `playground`) use the pre-NF-17.1 `project.json` shape — `build` is `@angular-architects/native-federation:build` with inline app options instead of pointing at an underlying `esbuild` target via `target`. NF v17.1+ requires the new shape and errors with `targetFromTargetString(undefined)`. **Pre-existing on upstream main** (`origin/main` has the same shape; the NF appbuilder schematic doesn't handle Nx's split per-project `project.json` layout). Belongs in a separate migration PR — see O4.
- [x] **C3.** Re-test against the consuming repo: rebuild + re-pack NF, reinstall in `src/angular-next`. **Done;** `remoteEntry.json` generates and serves correctly with CORS at `http://localhost:4201/remoteEntry.json`.
- [ ] **C4.** Open the upstream PR against `angular-architects/module-federation-plugin`. Scope: lib-side TS 6 + Angular 22-rc compatibility. App migration is explicitly out-of-scope (pre-existing upstream issue).

## Optional / deferred

- [ ] **O1.** Decide whether `@angular-eslint` should move to v22 (latest is 21.4.0 — no v22 yet). Pin to 21 with a tracking TODO, or wait for v22 and bump in a follow-up.
- [ ] **O2.** Beyond-upstream strictness pass: enable `noImplicitAny`/`strictNullChecks`/`useUnknownInCatchVariables`/`noPropertyAccessFromIndexSignature` in `libs/native-federation/tsconfig.lib.json` and fix the ~50 surfaced errors (builder.ts ~18, schematics/init ~14, plugin/index.ts 6, dev-externals-mixin.ts 6, schematics/remove 5, residual angular-esbuild-adapter.ts ~5, schematics/appbuilder 1, federation-build-notifier.ts 1, mem-resuts.ts 2). Independent of the Angular 22 bump — propose as its own upstream PR.
- [~] **O3.** ~~MF-family TS 6 compatibility.~~ **Done as part of A5/C1.** The five-flag relaxation pattern was applied to `libs/native-federation-node/tsconfig.lib.json`, `libs/mf-runtime/tsconfig.lib.json`, `libs/mf-tools/tsconfig.lib.json`, and `libs/mf/tsconfig.lib.json`. `libs/mf/tsconfig.lib.json` also gets `moduleResolution: "node"` back (the mf source imports `@rspack/core/dist/sharing/SharePlugin`, a deep path not in `@rspack/core`'s `exports` map — bundler resolution refuses to follow it). `playground-lib` has no `build` target so no migration needed.
- [ ] **O4.** App-level `project.json` migration to NF v17.1+ appbuilder shape (`mfe1`, `mfe2`, `playground`). Pre-existing on upstream main; the NF appbuilder schematic doesn't understand Nx split-project layouts. Belongs in a separate PR.
