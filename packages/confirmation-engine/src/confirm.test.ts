import { describe, expect, it } from 'vitest';
import {
  NotConfirmableError,
  confirm,
  createUserConfirmationEvidence,
  isConfirmedAction,
} from './confirm.js';
import type { WorkflowAdapter } from './workflow.js';

type Draft = { lines: string[] };

const adapter: WorkflowAdapter<Draft> & { toBundle(d: Draft): { n: number } } = {
  id: 'order',
  parse: (t) => ({ lines: t ? t.split(',') : [] }),
  validate: () => [],
  canConfirm: (d) => d.lines.length > 0,
  toBundle: (d) => ({ n: d.lines.length }),
};

const click = { isTrusted: true, type: 'click' };

describe('confirm', () => {
  it('mints a branded action from valid evidence', () => {
    const ev = createUserConfirmationEvidence(click, 2, () => new Date(0));
    const a = confirm(adapter, { lines: ['x'] }, ev);
    expect(a.bundle).toEqual({ n: 1 });
    expect(a.confirmation).toEqual({
      kind: 'user_confirm',
      at: '1970-01-01T00:00:00.000Z',
      draftRevision: 2,
    });
    expect(isConfirmedAction(a)).toBe(true);
  });

  it('throws when canConfirm is false', () => {
    const ev = createUserConfirmationEvidence(click, 1);
    expect(() => confirm(adapter, { lines: [] }, ev)).toThrow(NotConfirmableError);
  });

  it('throws when evidence is missing or forged', () => {
    expect(() => confirm(adapter, { lines: ['x'] }, undefined)).toThrow(NotConfirmableError);
    const forged = { confirmation: { kind: 'user_confirm', at: '', draftRevision: 1 } };
    expect(() => confirm(adapter, { lines: ['x'] }, forged as never)).toThrow(NotConfirmableError);
  });

  it('rejects untrusted or non-click events', () => {
    expect(() => createUserConfirmationEvidence({ isTrusted: false, type: 'click' }, 1)).toThrow(
      NotConfirmableError,
    );
    expect(() => createUserConfirmationEvidence({ isTrusted: true, type: 'keydown' }, 1)).toThrow(
      NotConfirmableError,
    );
  });

  it('isConfirmedAction rejects unbranded values', () => {
    expect(isConfirmedAction({ bundle: {}, confirmation: {} })).toBe(false);
    expect(isConfirmedAction(null)).toBe(false);
  });
});
