/**
 * Generate Gravity UI brand theme CSS via @gravity-ui/uikit-themer.
 *
 * Product UI accent is Sapphire Blue (#2563EB). Themer rebuilds
 * --g-color-private-brand-*, then we remap semantic brand tokens and lock
 * selection / hover / focus to the Cloud FinOps palette.
 *
 * Yellow stays Gravity default for warning + logo mark.
 * Violet is reserved for AI surfaces (see --cf-color-ai-* at the end).
 *
 * Usage: npm run theme:brand
 */
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  DEFAULT_THEME,
  generateCSS,
  updateBaseColor,
  type GravityTheme,
} from '@gravity-ui/uikit-themer';

/** Primary UI accent — Sapphire Blue. */
const BRAND_LIGHT = '#2563EB';
/** Brighter sapphire for dark surfaces. */
const BRAND_DARK = '#60A5FA';

/** Exact light-theme locks from the Cloud FinOps palette. */
const PALETTE_LIGHT = {
  brand: '#2563EB',
  hover: '#1D4ED8',
  pressed: '#1E40AF',
  selection: '#EFF6FF',
  selectionHover: '#DBEAFE',
  lineSoft: '#93C5FD',
  lineActive: '#60A5FA',
  focusRing: 'rgba(37, 99, 235, 0.25)',
} as const;

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/styles/brand-theme.css');

type ThemeVariant = 'light' | 'dark';

function withUtilityRef(
  theme: GravityTheme,
  token: string,
  refs: Record<ThemeVariant, string>,
): GravityTheme {
  return {
    ...theme,
    utilityColors: {
      ...theme.utilityColors,
      [token]: {
        light: {ref: refs.light},
        dark: {ref: refs.dark},
      },
    },
  };
}

function buildTheme(): GravityTheme {
  let theme = updateBaseColor({
    theme: DEFAULT_THEME,
    colorToken: 'brand',
    value: {light: BRAND_LIGHT, dark: BRAND_DARK},
  });

  const remap: Record<string, Record<ThemeVariant, string>> = {
    'base-brand': {
      light: 'private.brand.550-solid',
      dark: 'private.brand.550-solid',
    },
    'base-brand-hover': {
      light: 'private.brand.600-solid',
      dark: 'private.brand.650-solid',
    },
    'base-selection': {
      light: 'private.brand.50-solid',
      dark: 'private.brand.150',
    },
    'base-selection-hover': {
      light: 'private.brand.100-solid',
      dark: 'private.brand.200',
    },
    'line-brand': {
      light: 'private.brand.550-solid',
      dark: 'private.brand.550-solid',
    },
    'text-brand': {
      light: 'private.brand.600-solid',
      dark: 'private.brand.550-solid',
    },
    'text-brand-heavy': {
      light: 'private.brand.700-solid',
      dark: 'private.brand.700-solid',
    },
    'text-link': {
      light: 'private.brand.550-solid',
      dark: 'private.brand.550-solid',
    },
    'text-link-hover': {
      light: 'private.brand.600-solid',
      dark: 'private.brand.700-solid',
    },
  };

  for (const [token, refs] of Object.entries(remap)) {
    theme = withUtilityRef(theme, token, refs);
  }

  // White/light glyphs on solid sapphire buttons (not yellow-era dark text).
  theme = withUtilityRef(theme, 'text-brand-contrast', {
    light: 'utility.text-light-primary',
    dark: 'utility.text-dark-primary',
  });

  return theme;
}

const css = generateCSS({theme: buildTheme(), ignoreDefaultValues: true});

const paletteLock = `
/* --- Cloud FinOps palette lock (exact hex; wins over themer steps) --- */
.g-root_theme_light,
.g-root_theme_light-hc {
    --g-color-base-brand: ${PALETTE_LIGHT.brand};
    --g-color-base-brand-hover: ${PALETTE_LIGHT.hover};
    --g-color-text-brand: ${PALETTE_LIGHT.hover};
    --g-color-text-brand-heavy: ${PALETTE_LIGHT.pressed};
    --g-color-text-link: ${PALETTE_LIGHT.brand};
    --g-color-text-link-hover: ${PALETTE_LIGHT.hover};
    --g-color-line-brand: ${PALETTE_LIGHT.brand};
    --g-color-base-selection: ${PALETTE_LIGHT.selection};
    --g-color-base-selection-hover: ${PALETTE_LIGHT.selectionHover};
    --g-color-line-focus: ${PALETTE_LIGHT.focusRing};
    --cf-color-brand-pressed: ${PALETTE_LIGHT.pressed};
    --cf-color-brand-line-soft: ${PALETTE_LIGHT.lineSoft};
    --cf-color-brand-line-active: ${PALETTE_LIGHT.lineActive};
}

.g-root_theme_dark,
.g-root_theme_dark-hc {
    --g-color-base-brand: ${BRAND_DARK};
    --g-color-base-brand-hover: #93C5FD;
    --g-color-text-brand: ${BRAND_DARK};
    --g-color-text-brand-heavy: #93C5FD;
    --g-color-text-brand-contrast: var(--g-color-text-dark-primary);
    --g-color-text-link: ${BRAND_DARK};
    --g-color-text-link-hover: #93C5FD;
    --g-color-line-brand: ${BRAND_DARK};
    --g-color-line-focus: rgba(96, 165, 250, 0.35);
    --cf-color-brand-pressed: #2563EB;
    --cf-color-brand-line-soft: #1E3A8A;
    --cf-color-brand-line-active: #3B82F6;
}

/* AI accent — violet reserved for assistant / AI badges (not product chrome). */
.g-root {
    --cf-color-ai: #7C3AED;
    --cf-color-ai-hover: #6D28D9;
    --cf-color-ai-soft: #F5F3FF;
    --cf-color-ai-soft-strong: #EDE9FE;
    --cf-color-ai-line: #C4B5FD;
}

.g-root_theme_dark,
.g-root_theme_dark-hc {
    --cf-color-ai: #A78BFA;
    --cf-color-ai-hover: #C4B5FD;
    --cf-color-ai-soft: rgb(124 58 237 / 0.16);
    --cf-color-ai-soft-strong: rgb(124 58 237 / 0.28);
    --cf-color-ai-line: #7C3AED;
}
`;

const banner = `/* AUTO-GENERATED by scripts/generate-brand-theme.ts — do not edit by hand.
 * Product UI: Sapphire Blue ${BRAND_LIGHT} (light) / ${BRAND_DARK} (dark).
 * Yellow = logo / warning. Violet = AI only (--cf-color-ai-*).
 * Regenerate: npm run theme:brand
 */
`;

mkdirSync(dirname(OUT), {recursive: true});
writeFileSync(OUT, `${banner}\n${css.trim()}\n${paletteLock}\n`);
console.log(`Wrote ${OUT}`);
