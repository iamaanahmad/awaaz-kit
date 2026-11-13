import { describe, expect, it, vi } from 'vitest';
import type { BillDraft } from '@awaaz-kit/domain-billing';
import { getBillDraft, setBillDraft, subscribeBillDraft } from './billDraftStore';

describe('billDraftStore', () => {
  it('stores the draft and notifies subscribers until unsubscribed', () => {
    const listener = vi.fn();
    const off = subscribeBillDraft(listener);
    const draft = { id: 'd1' } as BillDraft;
    setBillDraft(draft);
    expect(getBillDraft()).toBe(draft);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    setBillDraft(null);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getBillDraft()).toBeNull();
  });
});
