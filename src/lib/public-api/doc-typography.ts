/**
 * Documentation prose may wrap identifiers in backticks: the docs page renders
 * them as code, plain-text consumers (meta description, JSON-LD) strip them.
 */

const NBSP = '\u00a0';
/** One- and two-letter words plus short prepositions/conjunctions stick to the next word. */
const SHORT_WORD_RE = /(?<![\p{L}])([а-яё]{1,2}|без|для|над|под|при|про|или|что|как)\s+(?=\S)/giu;
const DASH_RE = /\s+([—–])(?=\s)/g;
const NUMBER_UNIT_RE = /(\d)\s+(?=[\p{L}%₽])/gu;
export const CODE_SPAN_RE = /`([^`]+)`/g;

/** Russian typographic non-breaking spaces for display text. */
export function typograph(text: string): string {
  return text.replace(SHORT_WORD_RE, `$1${NBSP}`).replace(DASH_RE, `${NBSP}$1`).replace(NUMBER_UNIT_RE, `$1${NBSP}`);
}

export function plainText(text: string): string {
  return text.replace(CODE_SPAN_RE, '$1');
}
