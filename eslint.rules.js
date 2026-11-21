// Project lint rules that encode docs/technical-spec.md section 1 (layers) and
// AGENTS.md (security and token rules). They live in their own module so the
// rule tests can import them.

const msg = (text) => ({ message: text });

const AWS_SDK = { group: ["@aws-sdk/*"], ...msg("Only src/lib/s3 may import the AWS SDK.") };
const FEATURES = { group: ["@/features/**"], ...msg("This layer must not import features.") };
const APP = { group: ["@/app/**"], ...msg("Nothing outside src/app may import the app shell.") };
const COMPONENTS = { group: ["@/components/**"], ...msg("Libraries must not import components.") };
const REACT = {
  group: ["react", "react/*", "react-dom", "react-dom/*"],
  ...msg("src/lib is framework-free: no React."),
};
const S3 = { group: ["@/lib/s3", "@/lib/s3/**"], ...msg("This layer must not import lib/s3.") };
const STORAGE = { group: ["@/lib/storage", "@/lib/storage/**"], ...msg("This layer must not import lib/storage.") };
const PROVIDERS_FROM_STORAGE = {
  group: ["@/lib/providers", "@/lib/providers/**"],
  ...msg("lib/storage must not import lib/providers."),
};

/** `no-restricted-imports` options per source area. Later areas replace earlier ones, so each is complete. */
export const importRules = {
  // Everything in src except lib/s3 (the only SDK user).
  default: [AWS_SDK],
  app: [AWS_SDK],
  features: [AWS_SDK, APP],
  components: [AWS_SDK, APP, FEATURES, S3, STORAGE],
  lib: [AWS_SDK, REACT, COMPONENTS, FEATURES, APP],
  libS3: [REACT, COMPONENTS, FEATURES, APP],
  libStorage: [AWS_SDK, REACT, COMPONENTS, FEATURES, APP, S3, PROVIDERS_FROM_STORAGE],
  libProviders: [AWS_SDK, REACT, COMPONENTS, FEATURES, APP, S3, STORAGE],
  libI18n: [AWS_SDK, REACT, COMPONENTS, FEATURES, APP, S3, STORAGE],
};

export const restrictedImports = (patterns) => ["error", { patterns }];

/** `no-restricted-syntax` selectors for src (not tests). */
export const syntaxRules = [
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: "Never render bucket data as HTML. Use text nodes or the safe renderers in features/preview.",
  },
  {
    selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
    message: "No hard-coded colors. Use design tokens.",
  },
  {
    selector: "Literal[value=/\\b(rgb|rgba|hsl|hsla|oklch|oklab)\\(/]",
    message: "No hard-coded colors. Use design tokens.",
  },
  {
    selector: "Literal[value=/\\[-?[0-9.]+(px|rem|em)\\]/]",
    message: "No arbitrary pixel sizes in class names. Use tokens and the Tailwind scale.",
  },
  {
    selector: "TemplateElement[value.raw=/(#[0-9a-fA-F]{6}\\b|\\b(rgb|rgba|hsl|hsla)\\()/]",
    message: "No hard-coded colors. Use design tokens.",
  },
];

export const restrictedSyntax = ["error", ...syntaxRules];
