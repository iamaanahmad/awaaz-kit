import { describe, expect, it } from 'vitest';
import { addOrderLine, type OrderDraft } from '@awaaz-kit/domain-order';
import { currentDraft, setOrderLinePrice } from './resolveDraft';

const base: OrderDraft = {
  id: 'd1',
  shopId: 's',
  customerId: null,
  walkIn: true,
  fulfillment: 'pickup',
  note: '',
  lines: [],
  rawTranscript: '',
  normalizedText: '',
  revision: 0,
  mutationId: 'm1',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('resolveDraft', () => {
  it('uses the edited draft only for the parse it was made from', () => {
    const edited = addOrderLine(base, 'l1');
    expect(currentDraft(base, { base, draft: edited })).toBe(edited);
    expect(currentDraft({ ...base }, { base, draft: edited })).not.toBe(edited);
    expect(currentDraft(null, { base, draft: edited })).toBeNull();
  });

  it('sets a price snapshot and leaves unknown lines untouched', () => {
    const withLine = addOrderLine(base, 'l1');
    expect(setOrderLinePrice(withLine, 'l1', 4550).lines[0]?.unitPricePaise).toBe(4550);
    expect(setOrderLinePrice(withLine, 'nope', 1)).toBe(withLine);
  });
});
