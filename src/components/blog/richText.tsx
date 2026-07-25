import type {ReactNode} from 'react';
import Link from 'next/link';

const TOKEN =
  /(\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)|\*\*([^*]+)\*\*)/g;

/** Renders plain text with `[label](href)` links and `**bold**`. */
export function RichText({text}: {text: string}): ReactNode {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) {
      nodes.push(text.slice(last, index));
    }

    if (match[2] && match[3]) {
      const href = match[3];
      const label = match[2];
      if (href.startsWith('/')) {
        nodes.push(
          <Link key={key++} href={href}>
            {label}
          </Link>,
        );
      } else {
        nodes.push(
          <a key={key++} href={href} target="_blank" rel="noopener noreferrer">
            {label}
          </a>,
        );
      }
    } else if (match[4]) {
      nodes.push(<strong key={key++}>{match[4]}</strong>);
    }

    last = index + match[0].length;
  }

  if (last < text.length) {
    nodes.push(text.slice(last));
  }

  return nodes.length === 1 ? nodes[0] : <>{nodes}</>;
}
