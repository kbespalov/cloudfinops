import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {looksLikeIncompleteAgentNarration} from './tool-loop';

describe('looksLikeIncompleteAgentNarration', () => {
  it('flags Gemini-style status after compose without prices', () => {
    assert.equal(
      looksLikeIncompleteAgentNarration(
        'Все 6 решений вернулись со статусом valid. Валидирую лидера и запускаю точный прайсинг параллельно по всем провайдерам.',
      ),
      true,
    );
  });

  it('keeps a real priced markdown table', () => {
    assert.equal(
      looksLikeIncompleteAgentNarration(
        '**Сравнение**\n\n| Провайдер | Итого / мес |\n|---|---:|\n| Cloud.ru | 317 323 ₽ |\n',
      ),
      false,
    );
  });
});
