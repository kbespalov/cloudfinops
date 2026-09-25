import {Fragment, type ReactNode} from 'react';
import {CODE_SPAN_RE, typograph} from '@/lib/public-api/doc-typography';

export {typograph};

/** Renders `code` spans as <code> and applies typograph() to the prose between them. */
export function rich(text: string): ReactNode {
  return text.split(CODE_SPAN_RE).map((part, index) => index % 2
    ? <code key={index}>{part}</code>
    : <Fragment key={index}>{typograph(part)}</Fragment>);
}
