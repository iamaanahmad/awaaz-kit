import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';
import type { CatalogProduct } from '@awaaz-kit/catalog-matcher';
import {
  addLine,
  formatRupees,
  parseRupees,
  removeLine,
  setDiscount,
  setLineProduct,
  summarizeDraft,
  type BillDraft,
  type BillDraftLine,
} from '@awaaz-kit/domain-billing';
import {
  ClarificationPrompt,
  LineEditor,
  PipelineInspector,
  UncertaintyBadge,
  type InspectorLine,
  type LineEditorValue,
} from '@awaaz-kit/shared-ui';
import { getBillDraft, setBillDraft, useBillDraft } from '../capture/billDraftStore';
import { useLive, useShops } from '../data/homeHooks';
import { useServices } from '../providers/AppProviders';
import {
  BILL_UNITS,
  applyEditorChange,
  confirmCurrentValue,
  lineToEditorValue,
  nextLineClarification,
} from './linesLogic';

function toInspectorLines(draft: BillDraft): InspectorLine[] {
  return draft.lines.map((l) => ({
    lineId: l.lineId,
    spokenName: l.spokenName,
    candidates: l.candidates.map((c) => ({ id: c.id, name: c.name })),
    fields: [
      {
        label: 'Product',
        value: l.product.value?.name ?? null,
        status: l.product.status,
        confidence: l.product.confidence,
        reason: l.product.reason ?? null,
      },
      {
        label: 'Quantity',
        value: l.quantityMilli.value === null ? null : String(l.quantityMilli.value / 1000),
        status: l.quantityMilli.status,
        confidence: l.quantityMilli.confidence,
        reason: l.quantityMilli.reason ?? null,
      },
      {
        label: 'Unit',
        value: l.unit.value,
        status: l.unit.status,
        confidence: l.unit.confidence,
        reason: l.unit.reason ?? null,
      },
      {
        label: 'Price',
        value: l.price.value === null ? null : formatRupees(l.price.value),
        status: l.price.status,
        confidence: l.price.confidence,
        reason: l.price.reason ?? null,
      },
    ],
  }));
}

interface LineRowProps {
  line: BillDraftLine;
  index: number;
  products: readonly CatalogProduct[];
  lineTotalPaise: number;
  onChange: (prev: LineEditorValue, next: LineEditorValue) => void;
  onPickProduct: (product: CatalogProduct) => void;
  onRemove: () => void;
}

function LineRow({
  line,
  index,
  products,
  lineTotalPaise,
  onChange,
  onPickProduct,
  onRemove,
}: LineRowProps): ReactElement {
  const derived = lineToEditorValue(line);
  const [local, setLocal] = useState<LineEditorValue>(derived);
  const key = `${derived.productName}|${derived.quantity}|${derived.unit}|${derived.unitPricePaise}`;
  const lastKey = useRef(key);
  // Re-sync only when the draft itself changed (e.g. a clarification answer).
  useEffect(() => {
    if (lastKey.current !== key) {
      lastKey.current = key;
      setLocal(derived);
    }
  }, [key, derived]);

  return (
    <li className="flex flex-col gap-2">
      <LineEditor
        value={local}
        index={index}
        units={BILL_UNITS}
        onChange={(next) => {
          onChange(local, next);
          setLocal(next);
        }}
        onRemove={onRemove}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor={`pick-${line.lineId}`}>Pick catalog product for line {index}</label>
        <select
          id={`pick-${line.lineId}`}
          value={line.product.value?.productId ?? ''}
          onChange={(e) => {
            const p = products.find((x) => x.id === e.target.value);
            if (p) onPickProduct(p);
          }}
          className="touch-target rounded-[var(--radius)] border border-border bg-field px-2"
        >
          <option value="">Select product</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Product</span>
        <UncertaintyBadge status={line.product.status} />
        <span>Qty</span>
        <UncertaintyBadge status={line.quantityMilli.status} />
        <span>Price</span>
        <UncertaintyBadge status={line.price.status} />
        <span className="ml-auto font-semibold" data-testid={`line-total-${index}`}>
          {formatRupees(lineTotalPaise)}
        </span>
      </div>
      {line.price.value === null ? (
        <p role="status" className="text-sm">
          Enter a price for line {index} or remove the line.
        </p>
      ) : null}
    </li>
  );
}

export default function Lines(): ReactElement {
  const { repos } = useServices();
  const navigate = useNavigate();
  const draft = useBillDraft();
  const shops = useShops();
  const shop = shops ? (shops.find((s) => s.isDemo) ?? shops[0]) : undefined;
  const products =
    useLive(() => repos.products.watchActive(shop?.id ?? ''), [repos, shop?.id]) ?? [];
  const [discountText, setDiscountText] = useState(() =>
    draft && draft.discountPaise > 0 ? String(draft.discountPaise / 100) : '',
  );

  if (!draft) {
    return (
      <main className="mx-auto max-w-md p-4">
        <h1 className="text-2xl font-bold">Lines</h1>
        <p>No bill in progress.</p>
        <Link to="/capture" className="underline underline-offset-4">
          Start a new bill
        </Link>
      </main>
    );
  }

  const summary = summarizeDraft(draft);
  const clarification = nextLineClarification(draft.lines);
  const discountInvalid = discountText.trim() !== '' && parseRupees(discountText) === null;
  const productById = (id: string): CatalogProduct | undefined =>
    products.find((p) => p.id === id) ??
    draft.lines.flatMap((l) => l.candidates).find((p) => p.id === id);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Lines</h1>
        <Link to="/capture" className="underline underline-offset-4">
          Back to capture
        </Link>
      </header>

      <ClarificationPrompt
        clarification={clarification}
        onSelectCandidate={(candidate) => {
          const p = clarification ? productById(candidate.id) : undefined;
          if (clarification && p) setBillDraft(setLineProduct(draft, clarification.lineId, p));
        }}
      />
      {clarification && clarification.field !== 'product' ? (
        <button
          type="button"
          onClick={() => setBillDraft(confirmCurrentValue(draft, clarification))}
          className="touch-target self-start rounded-[var(--radius)] border border-border px-3 font-semibold"
        >
          Confirm current value
        </button>
      ) : null}

      {draft.lines.length === 0 ? <p role="status">No lines yet. Add a line to start.</p> : null}
      <ul className="flex list-none flex-col gap-4 p-0">
        {draft.lines.map((line, i) => (
          <LineRow
            key={line.lineId}
            line={line}
            index={i + 1}
            products={products}
            lineTotalPaise={summary.totals.lineTotals[i] ?? 0}
            onChange={(prev, next) => {
              setBillDraft(
                applyEditorChange(getBillDraft() ?? draft, line.lineId, prev, next, products),
              );
            }}
            onPickProduct={(p) => setBillDraft(setLineProduct(draft, line.lineId, p))}
            onRemove={() => setBillDraft(removeLine(draft, line.lineId))}
          />
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setBillDraft(addLine(draft, crypto.randomUUID()))}
        className="touch-target rounded-[var(--radius)] border border-border px-3 font-semibold"
      >
        Add line
      </button>

      <div className="flex flex-col gap-1">
        <label htmlFor="bill-discount">Discount (₹)</label>
        <input
          id="bill-discount"
          type="text"
          inputMode="decimal"
          value={discountText}
          aria-invalid={discountInvalid}
          onChange={(e) => {
            setDiscountText(e.target.value);
            const t = e.target.value.trim();
            const paise = t === '' ? 0 : parseRupees(t);
            if (paise !== null) setBillDraft(setDiscount(draft, paise));
          }}
          className="touch-target rounded-[var(--radius)] border border-border bg-field p-2"
        />
        {discountInvalid ? <p role="alert">Enter a discount like 10 or 10.50</p> : null}
      </div>

      <section aria-label="Totals" className="flex flex-col gap-1" data-testid="totals">
        <p className="flex justify-between">
          <span>Subtotal</span>
          <span data-testid="subtotal">{formatRupees(summary.totals.subtotalPaise)}</span>
        </p>
        {draft.discountPaise > 0 ? (
          <p className="flex justify-between">
            <span>Discount</span>
            <span>−{formatRupees(draft.discountPaise)}</span>
          </p>
        ) : null}
        <p className="flex justify-between text-lg font-bold">
          <span>Total</span>
          <span data-testid="total">{formatRupees(summary.totals.totalPaise)}</span>
        </p>
      </section>

      {summary.issues.length > 0 ? (
        <ul aria-label="Issues" className="list-disc pl-5 text-sm">
          {summary.issues.map((issue, i) => (
            <li key={`${issue.code}-${issue.lineId ?? 'bill'}-${i}`}>{issue.message}</li>
          ))}
        </ul>
      ) : null}

      <PipelineInspector
        raw={draft.rawTranscript}
        normalized={{ text: draft.normalizedText, tokens: [] }}
        lines={toInspectorLines(draft)}
      />

      <button
        type="button"
        onClick={() => void navigate('/review')}
        disabled={draft.lines.length === 0}
        className="touch-target rounded-[var(--radius)] bg-accent px-3 font-semibold text-accent-contrast disabled:opacity-50"
      >
        Review bill
      </button>
    </main>
  );
}
