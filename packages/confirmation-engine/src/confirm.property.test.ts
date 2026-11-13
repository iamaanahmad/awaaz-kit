import { describe, it } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check';
import {
  NotConfirmableError,
  confirm,
  createUserConfirmationEvidence,
  isConfirmedAction,
  type UserConfirmationEvidence,
} from './confirm.js';
import type { WorkflowAdapter } from './workflow.js';

type Draft = { lines: string[]; blocked: boolean };

// Oracle for confirmability is independent of the adapter implementation below.
const adapter: WorkflowAdapter<Draft> & { toBundle(d: Draft): { n: number } } = {
  id: 'order',
  parse: () => ({ lines: [], blocked: false }),
  validate: () => [],
  canConfirm: (d) => d.lines.length > 0 && !d.blocked,
  toBundle: (d) => ({ n: d.lines.length }),
};

const draftArb: fc.Arbitrary<Draft> = fc.record({
  lines: fc.array(fc.string({ minLength: 1, maxLength: 8 }), { maxLength: 4 }),
  blocked: fc.boolean(),
});

type EvidenceKind = 'valid' | 'missing' | 'null' | 'forged' | 'cloned';

const evidenceKindArb: fc.Arbitrary<EvidenceKind> = fc.constantFrom(
  'valid',
  'missing',
  'null',
  'forged',
  'cloned',
);

function makeEvidence(kind: EvidenceKind, revision: number): UserConfirmationEvidence | undefined | null {
  const real = createUserConfirmationEvidence({ isTrusted: true, type: 'click' }, revision);
  switch (kind) {
    case 'valid':
      return real;
    case 'missing':
      return undefined;
    case 'null':
      return null;
    case 'forged':
      return { confirmation: { kind: 'user_confirm', at: '', draftRevision: revision } } as never;
    case 'cloned':
      // Structural copy of real evidence is not the minted object.
      return { ...real } as never;
  }
}

describe('confirmation boundary', () => {
  // Feature: awaaz-kit, Property 19: Persistence requires explicit user confirmation
  // **Validates: Requirements 11.5, 11.7**
  it('Property 19: confirm succeeds only with canConfirm and valid click evidence', () => {
    assertProperty(
      fc.property(draftArb, evidenceKindArb, fc.nat(1000), (draft, kind, revision) => {
        const confirmable = draft.lines.length > 0 && !draft.blocked;
        const shouldSucceed = confirmable && kind === 'valid';
        const evidence = makeEvidence(kind, revision);
        let action: unknown;
        let error: unknown;
        try {
          action = confirm(adapter, draft, evidence);
        } catch (e) {
          error = e;
        }
        if (shouldSucceed) {
          return error === undefined && isConfirmedAction(action);
        }
        return error instanceof NotConfirmableError && action === undefined;
      }),
    );
  });

  // Companion example-style check (same property boundary, evidence and brand forgery).
  it('untrusted or non-click events never yield evidence; unbranded values are never ConfirmedActions', () => {
    assertProperty(
      fc.property(
        fc.boolean(),
        fc.constantFrom('click', 'keydown', 'submit', 'pointerdown', ''),
        fc.anything(),
        (isTrusted, type, anything) => {
          const shouldMint = isTrusted && type === 'click';
          let minted = true;
          try {
            createUserConfirmationEvidence({ isTrusted, type }, 1);
          } catch (e) {
            minted = false;
            if (!(e instanceof NotConfirmableError)) return false;
          }
          if (minted !== shouldMint) return false;

          // Arbitrary values, and structural clones of a real action, are not branded.
          const real = confirm(
            adapter,
            { lines: ['x'], blocked: false },
            createUserConfirmationEvidence({ isTrusted: true, type: 'click' }, 1),
          );
          return (
            !isConfirmedAction(anything) &&
            !isConfirmedAction({ ...real }) &&
            !isConfirmedAction(JSON.parse(JSON.stringify(real))) &&
            isConfirmedAction(real)
          );
        },
      ),
    );
  });
});
