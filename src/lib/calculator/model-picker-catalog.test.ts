import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  filterByLab,
  getLabInfos,
  getModelPickerCatalog,
  matchesQuickFilter,
  searchModels,
} from './model-picker-catalog';

describe('model-picker-catalog', () => {
  it('indexes all inference models with labs', () => {
    const catalog = getModelPickerCatalog();
    assert.ok(catalog.length >= 20);
    assert.ok(catalog.some((m) => m.displayName === 'Qwen3-Coder-Next'));
    const labs = getLabInfos(catalog);
    assert.ok(labs.some((l) => l.id === 'qwen' && l.count > 0));
    assert.ok(labs.some((l) => l.id === 'all'));
  });

  it('searches by name, task and size tokens', () => {
    const catalog = getModelPickerCatalog();
    assert.ok(searchModels('qwen coder', catalog).some((m) => m.id === 'qwen3-coder-next'));
    assert.ok(searchModels('reasoning', catalog).some((m) => /r1/i.test(m.displayName)));
    assert.ok(searchModels('32b', catalog).length > 0);
    assert.ok(searchModels('moe', catalog).every((m) => m.arch === 'moe' || m.searchText.includes('moe')));
  });

  it('filters by lab and quick chips', () => {
    const catalog = getModelPickerCatalog();
    const qwen = filterByLab(catalog, 'qwen');
    assert.ok(qwen.length > 0);
    assert.ok(qwen.every((m) => m.lab === 'qwen'));
    const coder = catalog.filter((m) => matchesQuickFilter(m, 'coder'));
    assert.ok(coder.some((m) => m.id === 'qwen3-coder-next'));
  });

  it('indexes speech / search / rerank models with labs', () => {
    const catalog = getModelPickerCatalog();
    assert.ok(catalog.some((m) => m.id === 'gigaam-v3' && m.tasks.includes('speech')));
    assert.ok(catalog.some((m) => m.id === 't-search' && m.lab === 'ttech'));
    assert.ok(catalog.some((m) => m.id === 'qwen3-reranker-0.6b' && m.tasks.includes('rerank')));
    assert.ok(searchModels('транскриб', catalog).some((m) => m.id === 'gigaam-v3'));
    assert.ok(searchModels('t-search', catalog).some((m) => m.id === 't-search'));
  });
});
