'use client';

import {usePathname} from 'next/navigation';
import Link from 'next/link';
import {PRICING_DISCLAIMER} from '@/lib/pricing-disclaimer';
import styles from './SiteFooter.module.css';

/**
 * Full-viewport shells keep the disclaimer in-page:
 * - `/` home hero
 * - `/chat` fixed visualViewport layout
 */
const HIDDEN_EXACT = new Set(['/']);
const HIDDEN_PREFIXES = ['/chat'];

export function SiteFooter() {
  const pathname = usePathname() ?? '';
  if (
    HIDDEN_EXACT.has(pathname) ||
    HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return null;
  }

  return (
    <footer className={styles.footer} role="contentinfo">
      <nav className={styles.links} aria-label="Интеграции Cloud FinOps">
        <Link href="/api">Public API</Link>
        <Link href="/api/mcp">MCP для AI-ассистентов</Link>
        <a href="/api/v1/openapi.json">OpenAPI</a>
        <a href="/llms.txt">llms.txt</a>
      </nav>
      <p className={styles.note}>{PRICING_DISCLAIMER}</p>
    </footer>
  );
}
