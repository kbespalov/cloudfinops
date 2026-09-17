import {notFound} from 'next/navigation';
import {ApiDocumentation, apiMetadata} from '@/components/api/ApiDocumentation';
import {DOCUMENTATION_PAGES} from '@/lib/public-api/discovery';

type Props = {params: Promise<{section: string}>};
const pageForSlug = (slug: string) => DOCUMENTATION_PAGES.find(page => page.path === `/api/${slug}`);

export function generateStaticParams() {
  return DOCUMENTATION_PAGES.filter(page => page.section !== 'overview').map(page => ({section: page.path.split('/').pop()!}));
}
export async function generateMetadata({params}: Props) {
  const page = pageForSlug((await params).section);
  if (!page) notFound();
  return apiMetadata(page.section);
}
export default async function ApiSectionRoute({params}: Props) {
  const page = pageForSlug((await params).section);
  if (!page) notFound();
  return <ApiDocumentation section={page.section}/>;
}
