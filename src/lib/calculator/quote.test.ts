import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {COMPUTE_PRESETS, GPU_PRESETS} from '@/lib/calculator/presets';
import {quoteAllPresets, quotePreset} from '@/lib/calculator/quote';

describe('calculator quote arbitration', () => {
  it('quotes every compute preset with at least one provider', () => {
    for (const preset of COMPUTE_PRESETS) {
      const result = quotePreset(preset, 'month');
      assert.ok(result.best, `expected a best offer for ${preset.id}`);
      assert.ok(result.quotes.length >= 1, `expected quotes for ${preset.id}`);
      assert.equal(result.alternateQuotes.length, 0);
    }
  });

  it('keeps compute quotes sorted ascending and best = cheapest', () => {
    for (const preset of COMPUTE_PRESETS) {
      const result = quotePreset(preset, 'month');
      for (let i = 1; i < result.quotes.length; i++) {
        assert.ok(
          result.quotes[i - 1]!.total <= result.quotes[i]!.total,
          `${preset.id}: quotes not sorted`,
        );
      }
      assert.equal(result.best?.total, result.quotes[0]?.total);
    }
  });

  it('builds orderable compute combos (region + platform + disk)', () => {
    for (const preset of COMPUTE_PRESETS) {
      const result = quotePreset(preset, 'month');
      for (const q of result.quotes) {
        const [vcpu, ram, disk] = q.meters;
        assert.ok(vcpu && ram, `${q.providerName}: missing vcpu/ram`);
        assert.equal(
          String(vcpu.region ?? ''),
          String(ram.region ?? ''),
          `${q.providerName}: region mismatch vCPU/RAM`,
        );
        const vp = String(vcpu.dimensions.cpuPlatformFamily ?? '');
        const rp = String(ram.dimensions.cpuPlatformFamily ?? '');
        if (vp && rp) {
          assert.equal(vp, rp, `${q.providerName}: platform mismatch`);
        }
        assert.ok(disk, `${q.providerName}: missing disk`);
        assert.equal(
          String(disk.region ?? ''),
          String(vcpu.region ?? ''),
          `${q.providerName}: disk region mismatch`,
        );
      }
    }
  });

  it('excludes fractional-guarantee cores from low-cost best meters', () => {
    const lowCost = COMPUTE_PRESETS.filter((p) => p.family === 'low-cost');
    assert.ok(lowCost.length >= 1);
    for (const preset of lowCost) {
      const result = quotePreset(preset, 'month');
      for (const q of result.quotes) {
        const vcpu = q.meters[0]!;
        const share = String(vcpu.dimensions.guaranteedVcpuShare ?? '');
        const pct = share.match(/(\d+)\s*%/);
        if (pct) {
          assert.ok(
            Number(pct[1]) >= 100,
            `${preset.id}/${q.providerName}: fractional core ${share}`,
          );
        }
      }
    }
  });

  it('never mixes gpu-only and bundle in the primary ranking', () => {
    for (const preset of GPU_PRESETS) {
      const result = quotePreset(preset, 'month');
      if (!result.quotes.length) continue;
      const scopes = new Set(result.quotes.map((q) => q.scope));
      assert.equal(scopes.size, 1, `${preset.id}: mixed scopes in primary quotes`);
      for (const alt of result.alternateQuotes) {
        assert.notEqual(
          alt.scope,
          result.quotes[0]!.scope,
          `${preset.id}: alternate leaked into same scope`,
        );
      }
      if (result.best) {
        assert.equal(result.best.scope, result.quotes[0]!.scope);
      }
    }
  });

  it('defaults GPU cards to gpu-only primary (unless preferBundle)', () => {
    for (const preset of GPU_PRESETS) {
      const result = quotePreset(preset, 'month');
      if (!result.best) continue;
      if (preset.preferBundle) {
        assert.equal(result.best.scope, 'bundle', `${preset.id} should prefer bundle`);
      } else if (result.quotes.some((q) => q.scope === 'gpu-only')) {
        assert.equal(result.best.scope, 'gpu-only', `${preset.id} should prefer gpu-only`);
      }
    }
  });

  it('breakdown parts sum to the quote total', () => {
    const all = [...COMPUTE_PRESETS, ...GPU_PRESETS];
    for (const preset of all) {
      const result = quotePreset(preset, 'month');
      for (const q of result.quotes) {
        const sum = q.parts.reduce((s, p) => s + p.amount, 0);
        assert.ok(
          Math.abs(sum - q.total) < 0.02,
          `${preset.id}/${q.providerName}: parts ${sum} != total ${q.total}`,
        );
      }
    }
  });

  it('quoteAllPresets covers every preset id once', () => {
    const map = quoteAllPresets('month');
    for (const preset of [...COMPUTE_PRESETS, ...GPU_PRESETS]) {
      assert.ok(map.has(preset.id), `missing ${preset.id}`);
    }
    assert.equal(map.size, COMPUTE_PRESETS.length + GPU_PRESETS.length);
  });
});
