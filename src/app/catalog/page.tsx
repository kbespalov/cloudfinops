import {Suspense} from 'react';
import {CatalogPage} from '@/components/catalog/CatalogPage';

export default function CatalogRoute() {
  return (
    <Suspense fallback={<div style={{padding: 24}}>Загрузка каталога…</div>}>
      <CatalogPage />
    </Suspense>
  );
}
