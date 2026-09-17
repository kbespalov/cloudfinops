import {API_VERSION, DISCLAIMER} from './constants';
import {snapshotVersion} from './ids';
import {catalog, type CatalogData} from '@/lib/catalog';
import type {ApiMeta} from './types';

export function catalogVersion(data: CatalogData = catalog): string {
  return (
    data.catalogVersion ||
    snapshotVersion(data.asOf, data.generatedAt, data.taxonomyVersion)
  );
}

export function baseMeta(extra?: Partial<ApiMeta>): ApiMeta {
  return {
    apiVersion: API_VERSION,
    catalogVersion: catalogVersion(),
    taxonomyVersion: catalog.taxonomyVersion,
    generatedAt: catalog.generatedAt,
    ...extra,
  };
}

export function successBody<T>(data: T, extraMeta?: Partial<ApiMeta>, pagination?: unknown) {
  return {
    data,
    meta: {...baseMeta(extraMeta), disclaimer: DISCLAIMER},
    ...(pagination ? {pagination} : {}),
  };
}

export function errorBody(
  code: string,
  message: string,
  details: Array<{path: string; code: string; value?: unknown}> = [],
) {
  return {
    error: {code, message, details},
  };
}
