/** Brand marks for LLM labs — Simple Icons (CC0) + compact custom marks. */

import type {ReactNode} from 'react';
import {
  detectModelFamily,
  MODEL_FAMILY_META,
  type ModelFamily,
} from '@/lib/calculator/model-family';
import {MODEL_FAMILY_ICON_PATHS} from './model-family-icons';
import styles from './ModelFamilyMark.module.css';

export type {ModelFamily};
export {detectModelFamily};

const BRAND_COLOR: Partial<Record<ModelFamily, string>> = {
  qwen: '#615CED',
  deepseek: '#4D6BFE',
  glm: '#1A6CFF',
  kimi: '#1783FF',
  llama: '#0668E1',
  gemma: '#1A73E8',
  mixtral: '#FF7000',
  mistral: '#FF7000',
  'gpt-oss': '#10A37F',
  phi: '#0078D4',
  giga: '#21A038',
  ttech: '#FFDD2D',
};

function BrandSvg({
  path,
  size,
  title,
  color,
  className,
}: {
  path: string;
  size: number;
  title: string;
  color: string;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={color}
      className={className}
      focusable="false"
      aria-hidden
    >
      <title>{title}</title>
      <path d={path} />
    </svg>
  );
}

/** Moonshot / Kimi — crescent (recognizable, not letter badge). */
function KimiMark({size, className}: {size: number; className?: string}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      focusable="false"
      aria-hidden
    >
      <title>Kimi</title>
      <path
        fill="#1783FF"
        d="M12.2 2.2c-5.1 0-9.3 4.1-9.3 9.3s4.2 9.3 9.3 9.3c1.7 0 3.3-.5 4.7-1.3-2.4.3-4.9-.5-6.7-2.3-2.4-2.4-3-6.1-1.5-9.1 1.3 2.6 4 4.3 7 4.3.5 0 1 0 1.5-.1C15.8 7.5 14.1 2.2 12.2 2.2z"
      />
    </svg>
  );
}

/** Zhipu / GLM — geometric mark inspired by Zhipu brand geometry. */
function GlmMark({size, className}: {size: number; className?: string}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      focusable="false"
      aria-hidden
    >
      <title>GLM</title>
      {/* Slightly inset so the glyph reads centered in the 24 box at chip sizes. */}
      <path
        fill="#1A6CFF"
        d="M4.4 5.6A1.4 1.4 0 0 1 5.8 4.2h4.9c.5 0 .9.2 1.1.6l7.2 8.7c.5.6.1 1.5-.7 1.5h-5.5l5.8 3.5c.7.4.4 1.4-.4 1.4H5.8A1.4 1.4 0 0 1 4.4 18.5V5.6zm3 2.2v7.9h2.9l5.1-6.1H7.4z"
      />
    </svg>
  );
}

/** Sber / GigaAM — green rounded mark. */
function GigaMark({size, className}: {size: number; className?: string}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      focusable="false"
      aria-hidden
    >
      <title>Sber / Giga</title>
      <rect width="24" height="24" rx="6" fill="#21A038" />
      <path
        fill="#fff"
        d="M12 5.6c-3.5 0-6.3 2.3-6.3 5.2 0 2.1 1.4 3.9 3.6 4.7l-1.3 2.6c-.2.4.2.8.6.6l3-1.6h.4c3.5 0 6.3-2.3 6.3-5.3S15.5 5.6 12 5.6zm0 8.3c-2.2 0-3.9-1.3-3.9-3.1S9.8 7.7 12 7.7s3.9 1.3 3.9 3.1-1.7 3.1-3.9 3.1z"
      />
    </svg>
  );
}

/** T-Tech — yellow tile with dark T (T-Bank family). */
function TtechMark({size, className}: {size: number; className?: string}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      focusable="false"
      aria-hidden
    >
      <title>T-Tech</title>
      <rect width="24" height="24" rx="6" fill="#FFDD2D" />
      {/* Optically centered T (letterforms read high; nudge down + inset). */}
      <path fill="#333" d="M6.2 7.4h11.6v2.4H13.4v8.2h-2.8V9.8H6.2V7.4z" />
    </svg>
  );
}

function LetterFallback({
  letters,
  size,
  color,
  className,
}: {
  letters: string;
  size: number;
  color: string;
  className?: string;
}) {
  const fontSize = letters.length > 1 ? size * 0.38 : size * 0.45;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      focusable="false"
      aria-hidden
    >
      <rect width="24" height="24" rx="6" fill={color} />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize={fontSize}
        fontWeight="700"
        fontFamily="var(--g-font-family-sans), system-ui, sans-serif"
      >
        {letters}
      </text>
    </svg>
  );
}

function iconForFamily(family: ModelFamily): 'qwen' | 'deepseek' | 'meta' | 'google' | 'mistral' | 'openai' | null {
  switch (family) {
    case 'qwen':
      return 'qwen';
    case 'deepseek':
      return 'deepseek';
    case 'llama':
      return 'meta';
    case 'gemma':
      return 'google';
    case 'mistral':
    case 'mixtral':
      return 'mistral';
    case 'gpt-oss':
      return 'openai';
    default:
      return null;
  }
}

export function ModelFamilyMark({
  name,
  size = 20,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const family = detectModelFamily(name);
  const meta = MODEL_FAMILY_META[family];
  const color = BRAND_COLOR[family] ?? 'var(--g-color-text-secondary)';
  const iconKey = iconForFamily(family);
  const wrapClass = [styles.mark, className].filter(Boolean).join(' ');

  let mark: ReactNode;
  /** Full-bleed painted plate — do not CSS-scale the whole SVG (leaves corner gaps). */
  let paintedPlate = false;
  if (family === 'kimi') {
    mark = <KimiMark size={size} />;
  } else if (family === 'glm') {
    mark = <GlmMark size={size} />;
  } else if (family === 'giga') {
    mark = <GigaMark size={size} />;
    paintedPlate = true;
  } else if (family === 'ttech') {
    mark = <TtechMark size={size} />;
    paintedPlate = true;
  } else if (iconKey) {
    mark = (
      <BrandSvg
        path={MODEL_FAMILY_ICON_PATHS[iconKey]}
        size={size}
        title={meta.title}
        color={color}
      />
    );
  } else {
    mark = (
      <LetterFallback
        letters={meta.letters}
        size={size}
        color={color === 'var(--g-color-text-secondary)' ? '#8a8a8a' : color}
      />
    );
    paintedPlate = true;
  }

  return (
    <span
      className={wrapClass}
      data-family={family}
      data-size={size <= 16 ? 's' : 'm'}
      data-plate={paintedPlate ? 'true' : undefined}
      title={meta.title}
      aria-hidden
      style={{width: size, height: size}}
    >
      {mark}
    </span>
  );
}
