import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIndex, type CatalogProduct } from '../../packages/catalog-matcher/src/index';
import type { WorkflowContext } from '../../packages/confirmation-engine/src/index';
import { DEMO_SEED, DEMO_SHOP_ID } from '../../packages/local-data/src/demo-shop';
import { AppointmentWorkflowAdapter } from '../../examples/appointment-workflow/src/appointment-workflow';

// README example compile test (task 24.5)
// **Validates: Requirements 1.8**

const ROOT = resolve(__dirname, '../..');
const EXAMPLE_PATH = resolve(ROOT, 'examples/appointment-workflow/src/appointment-workflow.ts');

function normalizeEol(s: string): string {
  return s.replace(/\r\n/g, '\n');
}

/** Returns the first ```ts block in the "Build your own workflow" section. */
function readmeBlock(): string {
  const readme = normalizeEol(readFileSync(resolve(ROOT, 'README.md'), 'utf8'));
  const start = readme.indexOf('## Build your own workflow');
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = readme.slice(start + 1);
  const next = rest.search(/^## /m);
  const section = next === -1 ? rest : rest.slice(0, next);
  const m = /```ts\n([\s\S]*?)\n```/.exec(section);
  expect(m).not.toBeNull();
  return (m as RegExpExecArray)[1] as string;
}

function context(): WorkflowContext<ReturnType<typeof buildIndex>> {
  const products: CatalogProduct[] = DEMO_SEED.products.map((p) => ({
    id: p.id,
    shopId: DEMO_SHOP_ID,
    name: p.name,
    aliases: [...p.aliases],
    ...(p.brand ? { brand: p.brand } : {}),
    unit: p.unit,
    pricePaise: p.pricePaise,
    active: true,
    deletedAt: null,
  }));
  let n = 0;
  return {
    shopId: DEMO_SHOP_ID,
    customers: [],
    catalog: buildIndex(DEMO_SHOP_ID, products),
    makeId: () => `id-${++n}`,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    config: { taxEnabled: false },
  };
}

describe('README "Build your own workflow" example', () => {
  it('embeds the example source verbatim', () => {
    const source = normalizeEol(readFileSync(EXAMPLE_PATH, 'utf8'));
    expect(readmeBlock().trimEnd()).toBe(source.trimEnd());
  });

  it('runs parse, validate and canConfirm on a sample utterance', () => {
    const adapter = new AppointmentWorkflowAdapter();

    const draft = adapter.parse('do kilo aata aur ek litre tel', context());
    expect(draft.rawTranscript).toBe('do kilo aata aur ek litre tel');
    expect(draft.services.length).toBeGreaterThan(0);
    const issues = adapter.validate(draft);
    expect(Array.isArray(issues)).toBe(true);
    expect(adapter.canConfirm(draft)).toBe(issues.length === 0);

    // No catalog product can be confirmed from a pleasantry, so confirmation stays blocked.
    const none = adapter.parse('dhanyavaad', context());
    expect(adapter.canConfirm(none)).toBe(false);
  });

  it('blocks confirmation for an unmatched service', () => {
    const adapter = new AppointmentWorkflowAdapter();
    const draft = adapter.parse('ek kilo zzqxv', context());
    expect(adapter.validate(draft).length).toBeGreaterThan(0);
    expect(adapter.canConfirm(draft)).toBe(false);
  });
});
