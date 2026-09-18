import type {Metadata} from 'next';
import {listAttributes} from '@/lib/public-api/attributes';
import {ApiPage} from './ApiPage';
import {listProducts, listProviders, listRegions, listServices} from '@/lib/public-api/catalog';
import {createEstimate} from '@/lib/public-api/estimates';
import {documentationPage, SITE_URL, DOCS_UPDATED_AT} from '@/lib/public-api/discovery';

export function apiMetadata(section: string): Metadata {
  const page = documentationPage(section)!;
  return {
    title: page.title, description: page.description,
    alternates: {canonical: page.path, ...(section === 'overview' ? {types: {'text/markdown': '/api/reference.md'}} : {})},
    robots: {index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large'},
    openGraph: {title: page.title, description: page.description, url: page.path, type: 'website', locale: 'ru_RU', siteName: 'Cloud FinOps'},
    twitter: {card: 'summary', title: page.title, description: page.description},
  };
}

export function ApiDocumentation({section = 'overview'}: {section?: string}) {
  const page = documentationPage(section)!;
  const exampleProduct = listProducts({q: 'L4', providers: ['selectel'], limit: 1}).items[0] ?? listProducts({limit: 1}).items[0];
  const exampleEstimate = createEstimate({resource: {type: 'compute', vcpu: 4, memoryGiB: 8}, providers: ['cloud-ru']});
  const regions = listRegions();
  const exampleRegion = regions.find(region => region.codes.length > 1) ?? regions[0];
  const structuredData = {'@context': 'https://schema.org', '@graph': [
    {'@type': 'TechArticle', '@id': `${SITE_URL}${page.path}#documentation`, url: `${SITE_URL}${page.path}`,
      headline: page.title, description: page.description, inLanguage: 'ru', dateModified: DOCS_UPDATED_AT,
      publisher: {'@type': 'Organization', name: 'Cloud FinOps', url: SITE_URL},
      about: {'@id': `${SITE_URL}/api#web-api`}, isAccessibleForFree: true},
    {'@type': 'WebAPI', '@id': `${SITE_URL}/api#web-api`, name: 'CloudFinOps Public API', url: `${SITE_URL}/api`,
      description: 'Каталог SKU и публичных тарифов российских облаков, расчёт месячной стоимости compute и GPU через REST API и MCP.',
      documentation: {'@id': `${SITE_URL}/api#documentation`}, provider: {'@type': 'Organization', name: 'Cloud FinOps', url: SITE_URL}},
    {'@type': 'BreadcrumbList', itemListElement: [
      {'@type': 'ListItem', position: 1, name: 'Cloud FinOps', item: SITE_URL},
      {'@type': 'ListItem', position: 2, name: 'MCP / API', item: `${SITE_URL}/api`},
      ...(section === 'overview' ? [] : [{'@type': 'ListItem', position: 3, name: page.title, item: `${SITE_URL}${page.path}`}]),
    ]},
  ]};
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(structuredData).replace(/</g, '\\u003c')}}/>
    <ApiPage key={section} initialSection={section} exampleProduct={exampleProduct} exampleRegion={exampleRegion} exampleEstimate={exampleEstimate} services={listServices()} attributeCategories={listAttributes()} regions={regions}
      providers={listProviders().map(({id, name}) => ({id, name}))}/>
  </>;
}
