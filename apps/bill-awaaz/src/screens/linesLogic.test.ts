import { describe, expect, it } from 'vitest';
import {
  addLine,
  setLinePrice,
  setLineProduct,
  setLineQuantity,
  setLineUnit,
  summarizeDraft,
  type BillDraft,
} from '@awaaz-kit/domain-billing';
import type { CatalogProduct } from '@awaaz-kit/catalog-matcher';
import {
  applyEditorChange,
  confirmCurrentValue,
  lineToEditorValue,
  nextLineClarification,
} from './linesLogic';

const atta: CatalogProduct = {
  id: 'p1',
  shopId: 's',
  name: 'Atta',
  aliases: [],
  unit: 'kg',
  pricePaise: 4500,
  active: true,
  deletedAt: null,
};

const empty = (): BillDraft => ({
  id: 'b',
  shopId: 's',
  customerId: null,
  lines: [],
  discountPaise: 0,
  taxPaise: 0,
  taxEnabled: false,
  rawTranscript: '',
  normalizedText: '',
  revision: 0,
  mutationId: 'm',
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('linesLogic', () => {
  it('walks a new line from unresolved to confirmable and recomputes totals', () => {
    let d = addLine(empty(), 'l1');
    expect(nextLineClarification(d.lines)?.field).toBe('product');
    const prev = lineToEditorValue(d.lines[0]!);
    d = applyEditorChange(d, 'l1', prev, { ...prev, productName: 'atta' }, [atta]);
    expect(d.lines[0]!.price.value).toBe(4500);
    const p2 = lineToEditorValue(d.lines[0]!);
    d = applyEditorChange(d, 'l1', p2, { ...p2, quantity: 2, unit: 'kg' }, [atta]);
    expect(nextLineClarification(d.lines)).toBeNull();
    expect(summarizeDraft(d).totals.totalPaise).toBe(9000);
    const p3 = lineToEditorValue(d.lines[0]!);
    d = applyEditorChange(d, 'l1', p3, { ...p3, quantity: 3, unitPricePaise: 5000 }, [atta]);
    expect(summarizeDraft(d).totals.totalPaise).toBe(15000);
    expect(summarizeDraft(d).canConfirm).toBe(true);
  });

  it('ignores blank quantity and price, and confirms a current value', () => {
    let d = addLine(empty(), 'l1');
    d = setLineProduct(d, 'l1', atta);
    d = setLineQuantity(d, 'l1', 1000);
    d = setLineUnit(d, 'l1', 'kg');
    const prev = lineToEditorValue(d.lines[0]!);
    expect(
      applyEditorChange(d, 'l1', prev, { ...prev, quantity: null, unitPricePaise: null }, [atta]),
    ).toBe(d);
    const c = { lineId: 'l1', field: 'price' as const, prompt: '', candidates: [] };
    d = {
      ...d,
      lines: [{ ...d.lines[0]!, price: { ...d.lines[0]!.price, status: 'needs_review' } }],
    };
    expect(nextLineClarification(d.lines)?.field).toBe('price');
    expect(nextLineClarification(confirmCurrentValue(d, c).lines)).toBeNull();
    expect(setLinePrice(d, 'l1', 100).lines[0]!.price.status).toBe('confirmed');
  });
});
