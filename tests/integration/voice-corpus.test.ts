import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildIndex, type CatalogProduct } from '../../packages/catalog-matcher/src/index';
import type { WorkflowContext } from '../../packages/confirmation-engine/src/index';
import { BillingWorkflowAdapter } from '../../packages/domain-billing/src/index';
import { OrderWorkflowAdapter } from '../../packages/domain-order/src/index';
import { DEMO_SEED } from '../../packages/local-data/src/demo-shop';

/**
 * Voice_Corpus runner (Req 19.8, 19.9, 10.10).
 *
 * Drives the real shared pipeline (normalize -> extract -> resolveLines) through the
 * domain adapter the entry's `app` routes to. Expected values come from the hand-authored
 * corpus; thresholds are fixed. Writes docs/corpus-report.md.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const CORPUS_PATH = resolve(ROOT, 'tests/fixtures/voice-corpus/corpus.json');
const REPORT_PATH = resolve(ROOT, 'docs/corpus-report.md');

const ROUTING_MIN = 0.95;
const EXTRACTION_MIN = 0.85;

type AppId = 'order' | 'bill';
type Status = 'confirmed' | 'needs_review' | 'missing' | 'unmatched' | 'ambiguous';

interface ExpectedLine {
  productId: string | null;
  qtyMilli: number | null;
  unit: string;
  status: Status;
}
interface CorpusEntry {
  id: string;
  group: string;
  app: AppId;
  referenceTranscript: string;
  expected: { lines: ExpectedLine[] };
  seededUncertainty: {
    lineIndex: number;
    field: 'product' | 'quantity' | 'unit';
    expectedStatus: Status;
  } | null;
}
interface Corpus {
  entries: CorpusEntry[];
}

interface ActualLine {
  productId: string | null;
  qtyMilli: number | null;
  unit: string | null;
  productStatus: Status;
  quantityStatus: Status;
  unitStatus: Status;
}

const corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as Corpus;

const shopId = DEMO_SEED.shop.id;
const products: CatalogProduct[] = DEMO_SEED.products.map((p) => ({
  id: p.id,
  shopId,
  name: p.name,
  aliases: [...p.aliases],
  ...(p.brand ? { brand: p.brand } : {}),
  unit: p.unit,
  pricePaise: p.pricePaise,
  active: true,
  deletedAt: null,
}));
const catalog = buildIndex(shopId, products);

let idCounter = 0;
const context: WorkflowContext<typeof catalog> = {
  shopId,
  customers: DEMO_SEED.customers.map((c) => ({ id: c.id, name: c.name })),
  catalog,
  makeId: () => `corpus-id-${++idCounter}`,
  now: () => new Date('2026-01-01T00:00:00.000Z'),
  config: { taxEnabled: false },
};

/** The parse route: each app id maps to its own domain adapter. */
const routes = {
  order: new OrderWorkflowAdapter(),
  bill: new BillingWorkflowAdapter(),
} as const;

interface RunResult {
  entry: CorpusEntry;
  routedTo: AppId;
  lines: ActualLine[];
  routingOk: boolean;
  extractionOk: boolean | null; // null for seeded-uncertainty entries (not "clean")
  seededOk: boolean | null; // null for clean entries
  notes: string[];
}

function runEntry(entry: CorpusEntry): RunResult {
  const adapter = routes[entry.app];
  const draft = adapter.parse(entry.referenceTranscript, context);
  const lines: ActualLine[] = draft.lines.map((l) => ({
    productId: l.product.value?.productId ?? null,
    qtyMilli: l.quantityMilli.value,
    unit: l.unit.value,
    productStatus: l.product.status as Status,
    quantityStatus: l.quantityMilli.status as Status,
    unitStatus: l.unit.status as Status,
  }));

  const notes: string[] = [];
  const routingOk = adapter.id === entry.app && lines.length === entry.expected.lines.length;
  if (!routingOk) {
    notes.push(`expected ${entry.expected.lines.length} line(s), parsed ${lines.length}`);
  }

  let extractionOk: boolean | null = null;
  let seededOk: boolean | null = null;

  if (entry.seededUncertainty === null) {
    extractionOk =
      lines.length === entry.expected.lines.length &&
      entry.expected.lines.every((exp, i) => {
        const act = lines[i];
        if (!act) return false;
        const same =
          act.productId === exp.productId &&
          act.qtyMilli === exp.qtyMilli &&
          act.unit === exp.unit &&
          act.productStatus === exp.status;
        if (!same) {
          notes.push(
            `line ${i}: expected ${JSON.stringify(exp)}, got ` +
              JSON.stringify({
                productId: act.productId,
                qtyMilli: act.qtyMilli,
                unit: act.unit,
                status: act.productStatus,
              }),
          );
        }
        return same;
      });
  } else {
    const s = entry.seededUncertainty;
    const act = lines[s.lineIndex];
    const status =
      act === undefined
        ? undefined
        : s.field === 'product'
          ? act.productStatus
          : s.field === 'quantity'
            ? act.quantityStatus
            : act.unitStatus;
    // Req 10.10: never confirmed; also must be the hand-authored status.
    seededOk = status !== undefined && status !== 'confirmed' && status === s.expectedStatus;
    if (!seededOk) {
      notes.push(
        `seeded ${s.field}@${s.lineIndex}: expected ${s.expectedStatus}, got ${String(status)}`,
      );
    }
  }

  return { entry, routedTo: adapter.id, lines, routingOk, extractionOk, seededOk, notes };
}

const results = corpus.entries.map(runEntry);

const pct = (n: number, d: number): number => (d === 0 ? 100 : (n / d) * 100);
const fmt = (n: number): string => `${n.toFixed(1)}%`;

const routingOk = results.filter((r) => r.routingOk).length;
const clean = results.filter((r) => r.extractionOk !== null);
const cleanOk = clean.filter((r) => r.extractionOk === true).length;
const seeded = results.filter((r) => r.seededOk !== null);
const seededOkCount = seeded.filter((r) => r.seededOk === true).length;

function buildReport(): string {
  const routingPct = pct(routingOk, results.length);
  const extractionPct = pct(cleanOk, clean.length);
  const seededPct = pct(seededOkCount, seeded.length);
  const gate = (ok: boolean): string => (ok ? 'PASS' : 'FAIL');
  const groups = [...new Set(results.map((r) => r.entry.group))];
  const out: string[] = [];
  out.push('# Voice corpus report', '');
  out.push(
    'Generated by `tests/integration/voice-corpus.test.ts` during `pnpm test`. Do not edit by hand.',
    '',
    'Text-only corpus (no audio) against the Demo_Shop catalog, run through the real pipeline',
    '(normalize, extract, resolveLines) via the domain adapter each entry routes to.',
    'Expected values are hand-authored in `tests/fixtures/voice-corpus/corpus.json`.',
    '',
  );
  out.push('## Quality gates', '');
  out.push('| Gate | Result | Threshold | Status |', '|---|---|---|---|');
  out.push(
    `| Routing to the correct app parse route | ${fmt(routingPct)} (${routingOk}/${results.length}) | >= 95% | ${gate(routingPct >= ROUTING_MIN * 100)} |`,
    `| Complete exact extraction, clean transcripts | ${fmt(extractionPct)} (${cleanOk}/${clean.length}) | >= 85% | ${gate(extractionPct >= EXTRACTION_MIN * 100)} |`,
    `| Seeded uncertainty flagged (not confirmed) | ${fmt(seededPct)} (${seededOkCount}/${seeded.length}) | 100% | ${gate(seededOkCount === seeded.length)} |`,
    '',
  );
  out.push(
    "Definitions: a route is correct when the entry's `app` selects its own adapter and the parse yields the expected number of lines. Complete exact extraction means every line matches the expected product id, quantity (milli-units), unit and product status. A seeded field is flagged when its status is not `confirmed` and equals the expected status.",
    '',
  );
  out.push(
    '## By group',
    '',
    '| Group | Entries | Routed | Clean exact | Seeded flagged |',
    '|---|---|---|---|---|',
  );
  for (const g of groups) {
    const rs = results.filter((r) => r.entry.group === g);
    const c = rs.filter((r) => r.extractionOk !== null);
    const s = rs.filter((r) => r.seededOk !== null);
    out.push(
      `| ${g} | ${rs.length} | ${rs.filter((r) => r.routingOk).length}/${rs.length} | ${c.filter((r) => r.extractionOk).length}/${c.length} | ${s.filter((r) => r.seededOk).length}/${s.length} |`,
    );
  }
  out.push('');
  const failing = results.filter(
    (r) => !r.routingOk || r.extractionOk === false || r.seededOk === false,
  );
  out.push('## Failing entries', '');
  if (failing.length === 0) {
    out.push('None.', '');
  } else {
    for (const r of failing) {
      out.push(`- \`${r.entry.id}\` (${r.entry.app}): "${r.entry.referenceTranscript}"`);
      for (const n of r.notes) out.push(`  - ${n}`);
    }
    out.push('');
  }
  return out.join('\n');
}

describe('Voice_Corpus runner', () => {
  it('has at least 30 text-only entries', () => {
    expect(results.length).toBeGreaterThanOrEqual(30);
  });

  it('writes docs/corpus-report.md', () => {
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, buildReport(), 'utf8');
    expect(readFileSync(REPORT_PATH, 'utf8')).toContain('# Voice corpus report');
  });

  // **Validates: Requirements 19.8**
  it('routes at least 95 percent of utterances to the correct app parse route', () => {
    expect(pct(routingOk, results.length)).toBeGreaterThanOrEqual(ROUTING_MIN * 100);
  });

  // **Validates: Requirements 19.9**
  it('extracts complete exact product and quantity for at least 85 percent of clean transcripts', () => {
    expect(pct(cleanOk, clean.length)).toBeGreaterThanOrEqual(EXTRACTION_MIN * 100);
  });

  // **Validates: Requirements 10.10**
  it('flags 100 percent of seeded ambiguity fixtures with a non-confirmed status', () => {
    const bad = seeded.filter((r) => r.seededOk !== true).map((r) => r.entry.id);
    expect(bad).toEqual([]);
  });
});
