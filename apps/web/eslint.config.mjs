import next from "eslint-config-next/core-web-vitals";

/**
 * ESLint flat config (ESLint 9 / Next 16).
 *
 * `next lint` was removed in Next 16, so we invoke ESLint directly. The
 * `eslint-config-next` package ships a flat-config array (Linter.Config[]),
 * which we spread here. This is the direct equivalent of the previous
 * `.eslintrc.json` `{ "extends": "next/core-web-vitals" }`.
 */
const config = [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
  ...next,
  {
    rules: {
      // These rules ship newly-enabled in Next 16's config (React Compiler /
      // react-hooks v6). They flag pre-existing, intentional patterns —
      // initializing local state from sessionStorage / React Query data inside
      // an effect, and react-hook-form's non-memoizable `watch()`. Demote to
      // warnings during this dependency upgrade rather than redesigning the
      // affected components.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/incompatible-library": "warn",
    },
  },
];

export default config;
