import { describe, expect, it } from 'vitest';
import { buildReview, validationIssueSchema, type WorkflowAdapter } from './workflow.js';

type Draft = { lines: string[] };

const adapter: WorkflowAdapter<Draft> = {
  id: 'order',
  parse: (text) => ({ lines: text ? text.split(',') : [] }),
  validate: (d) => (d.lines.includes('bad') ? [{ code: 'bad_line', message: 'Bad line' }] : []),
  canConfirm(d) {
    return this.validate(d).length === 0 && d.lines.length > 0;
  },
};

describe('buildReview', () => {
  it('is confirmable for a valid draft', () => {
    const r = buildReview(adapter, { lines: ['a'] }, 3);
    expect(r).toEqual({ draft: { lines: ['a'] }, revision: 3, issues: [], canConfirm: true });
  });

  it('is not confirmable with no lines', () => {
    expect(buildReview(adapter, { lines: [] }, 1).canConfirm).toBe(false);
  });

  it('reports issues and blocks confirm', () => {
    const r = buildReview(adapter, { lines: ['bad'] }, 1);
    expect(r.issues).toHaveLength(1);
    expect(r.canConfirm).toBe(false);
    expect(validationIssueSchema.safeParse(r.issues[0]).success).toBe(true);
  });
});
