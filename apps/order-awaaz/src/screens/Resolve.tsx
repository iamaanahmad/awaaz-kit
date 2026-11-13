import { useId, useMemo, useState, type FormEvent, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';
import { nextClarification } from '@awaaz-kit/confidence-engine';
import {
  removeOrderLine,
  setOrderLineProduct,
  setOrderLineQuantity,
  setOrderLineUnit,
  summarizeOrderDraft,
  type OrderDraftLine,
} from '@awaaz-kit/domain-order';
import { CANONICAL_UNITS, normalize, type CanonicalUnit } from '@awaaz-kit/language-normalizer';
import { DEMO_SHOP_ID } from '@awaaz-kit/local-data';
import {
  ClarificationPrompt,
  LineEditor,
  PipelineInspector,
  UncertaintyBadge,
  type InspectorLine,
} from '@awaaz-kit/shared-ui';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { useData, useOrderCapture } from '../providers/AppProviders';
import { setOrderLinePrice, useResolvedDraft } from '../capture/resolveDraft';

const isUnit = (u: string): u is CanonicalUnit =>
  (CANONICAL_UNITS as readonly string[]).includes(u);

const fieldLabels = [
  ['product', 'Product'],
  ['quantityMilli', 'Quantity'],
  ['unit', 'Unit'],
] as const;

function toInspectorLine(line: OrderDraftLine): InspectorLine {
  return {
    lineId: line.lineId,
    spokenName: line.spokenName,
    match: {
      kind:
        line.product.status === 'unmatched'
          ? 'none'
          : line.candidates.length > 0
            ? 'ambiguous'
            : 'exact',
      productName: line.product.value?.name ?? null,
    },
    candidates: line.candidates.map((c) => ({ id: c.id, name: c.name })),
    fields: [
      {
        label: 'Product',
        value: line.product.value?.name ?? null,
        status: line.product.status,
        confidence: line.product.confidence,
        reason: line.product.reason ?? null,
      },
      {
        label: 'Quantity',
        value: line.quantityMilli.value === null ? null : String(line.quantityMilli.value / 1000),
        status: line.quantityMilli.status,
        confidence: line.quantityMilli.confidence,
        reason: line.quantityMilli.reason ?? null,
      },
      {
        label: 'Unit',
        value: line.unit.value,
        status: line.unit.status,
        confidence: line.unit.confidence,
        reason: line.unit.reason ?? null,
      },
    ],
  };
}

export default function Resolve(): ReactElement {
  const navigate = useNavigate();
  const { repos } = useData();
  const { session } = useOrderCapture();
  const { draft, update } = useResolvedDraft(session.draft);
  const products = useLiveQuery(() => repos.products.watchActive(DEMO_SHOP_ID), [repos]);
  const [typedNames, setTypedNames] = useState<Record<string, string>>({});
  const [quantityText, setQuantityText] = useState('');
  const quantityId = useId();
  const pickId = useId();

  const clarification = useMemo(() => (draft ? nextClarification(draft.lines) : null), [draft]);
  const summary = useMemo(() => (draft ? summarizeOrderDraft(draft) : null), [draft]);
  const normalized = useMemo(() => (draft ? normalize(draft.rawTranscript) : null), [draft]);

  if (draft === null) {
    return (
      <section className="flex flex-col gap-4" aria-labelledby="resolve-heading">
        <h2 id="resolve-heading" className="text-lg font-semibold">
          Resolve items
        </h2>
        <p role="status">No order to check yet.</p>
        <Link to="/capture" className="touch-target font-semibold underline">
          Back to capture
        </Link>
      </section>
    );
  }

  const chooseProduct = (lineId: string, productId: string): void => {
    const product = (products ?? []).find((p) => p.id === productId);
    if (!product) return;
    setTypedNames((m) => Object.fromEntries(Object.entries(m).filter(([id]) => id !== lineId)));
    update((d) => setOrderLineProduct(d, lineId, product));
  };

  const submitQuantity = (e: FormEvent): void => {
    e.preventDefault();
    const n = Number(quantityText);
    if (!clarification || quantityText.trim() === '' || !Number.isFinite(n) || n <= 0) return;
    update((d) => setOrderLineQuantity(d, clarification.lineId, Math.round(n * 1000)));
    setQuantityText('');
  };

  // Unit choices are offered as candidate buttons; no conversion is applied (Req 10.3).
  const prompt =
    clarification === null
      ? null
      : {
          lineId: clarification.lineId,
          field: clarification.field,
          prompt: clarification.prompt,
          candidates:
            clarification.field === 'unit'
              ? CANONICAL_UNITS.map((u) => ({ id: u, name: u }))
              : clarification.candidates.map((c) => ({ id: c.id, name: c.name })),
        };

  return (
    <section className="flex flex-col gap-6" aria-labelledby="resolve-heading">
      <h2 id="resolve-heading" className="text-lg font-semibold">
        Resolve items
      </h2>

      {prompt !== null && clarification !== null ? (
        <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-border p-3">
          <p className="text-sm">
            Item {clarification.lineIndex + 1} of {draft.lines.length}
          </p>
          <ClarificationPrompt
            clarification={prompt}
            onSelectCandidate={(c) => {
              if (clarification.field === 'product') chooseProduct(clarification.lineId, c.id);
              else if (clarification.field === 'unit' && isUnit(c.id)) {
                const unit = c.id;
                update((d) => setOrderLineUnit(d, clarification.lineId, unit));
              }
            }}
          />
          {clarification.field === 'quantityMilli' ? (
            <form onSubmit={submitQuantity} className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label htmlFor={quantityId}>Quantity</label>
                <input
                  id={quantityId}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={quantityText}
                  onChange={(e) => setQuantityText(e.target.value)}
                  className="touch-target ak-input"
                />
              </div>
              <button type="submit" className="touch-target ak-btn ak-btn-primary">
                Set quantity
              </button>
            </form>
          ) : null}
          {clarification.field === 'product' ? (
            <div className="flex flex-col gap-1">
              <label htmlFor={pickId}>Choose from catalog</label>
              <select
                id={pickId}
                value=""
                onChange={(e) => chooseProduct(clarification.lineId, e.target.value)}
                className="touch-target ak-select"
              >
                <option value="">Select a product</option>
                {(products ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : (
        <p role="status" aria-live="polite">
          {draft.lines.length === 0
            ? 'No items left. Add items on the capture screen.'
            : 'All items are clear. Continue to review.'}
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {draft.lines.map((line, i) => (
          <li key={line.lineId} className="flex flex-col gap-2">
            <ul className="flex flex-wrap gap-3" aria-label={`Line ${i + 1} field status`}>
              {fieldLabels.map(([key, label]) => (
                <li key={key} className="flex items-center gap-1 text-sm">
                  <span>{label}:</span>
                  <UncertaintyBadge
                    status={line[key].status}
                    {...(line[key].confidence !== null && line[key].confidence !== undefined
                      ? { confidence: line[key].confidence }
                      : {})}
                  />
                </li>
              ))}
            </ul>
            <LineEditor
              index={i + 1}
              units={CANONICAL_UNITS}
              value={{
                productName: typedNames[line.lineId] ?? line.product.value?.name ?? line.spokenName,
                quantity:
                  line.quantityMilli.value === null ? null : line.quantityMilli.value / 1000,
                unit: line.unit.value ?? '',
                unitPricePaise: line.unitPricePaise,
              }}
              onChange={(next) => {
                const typed = next.productName;
                const current = line.product.value?.name ?? line.spokenName;
                if (typed !== current) {
                  const exact = (products ?? []).find(
                    (p) => p.name.toLowerCase() === typed.trim().toLowerCase(),
                  );
                  if (exact) chooseProduct(line.lineId, exact.id);
                  else setTypedNames((m) => ({ ...m, [line.lineId]: typed }));
                }
                if (next.quantity !== null && next.quantity > 0) {
                  const milli = Math.round(next.quantity * 1000);
                  if (milli !== line.quantityMilli.value) {
                    update((d) => setOrderLineQuantity(d, line.lineId, milli));
                  }
                }
                if (next.unit !== (line.unit.value ?? '') && isUnit(next.unit)) {
                  const unit = next.unit;
                  update((d) => setOrderLineUnit(d, line.lineId, unit));
                }
                if (next.unitPricePaise !== line.unitPricePaise) {
                  update((d) => setOrderLinePrice(d, line.lineId, next.unitPricePaise));
                }
              }}
              onRemove={() => update((d) => removeOrderLine(d, line.lineId))}
            />
          </li>
        ))}
      </ul>

      <PipelineInspector
        raw={draft.rawTranscript}
        normalized={normalized}
        lines={draft.lines.map(toInspectorLine)}
      />

      <div className="flex flex-wrap gap-3">
        <Link
          to="/capture"
          className="touch-target ak-btn ak-btn-secondary"
        >
          Back to capture
        </Link>
        <button
          type="button"
          disabled={summary === null || !summary.canConfirm}
          onClick={() => void navigate('/review')}
          className="touch-target ak-btn ak-btn-primary"
        >
          Continue to review
        </button>
      </div>
    </section>
  );
}
