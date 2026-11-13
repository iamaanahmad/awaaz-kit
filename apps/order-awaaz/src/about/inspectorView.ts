import type { InspectorField, InspectorLine, PipelineInspectorProps } from '@awaaz-kit/shared-ui';
import type { OrderDraft, OrderDraftLine } from '@awaaz-kit/domain-order';
import { normalize } from '@awaaz-kit/language-normalizer';

function quantityText(line: OrderDraftLine): string | null {
  const milli = line.quantityMilli.value;
  return milli === null ? null : String(milli / 1000);
}

function toInspectorLine(line: OrderDraftLine): InspectorLine {
  const productName = line.product.value?.name ?? null;
  const kind =
    line.product.status === 'confirmed'
      ? 'exact'
      : line.product.status === 'needs_review'
        ? 'ambiguous'
        : 'none';
  const fields: InspectorField[] = [
    {
      label: 'Product',
      value: productName,
      status: line.product.status,
      confidence: line.product.confidence,
      sourceText: line.product.sourceText,
      reason: line.product.reason,
    },
    {
      label: 'Quantity',
      value: quantityText(line),
      status: line.quantityMilli.status,
      confidence: line.quantityMilli.confidence,
      sourceText: line.quantityMilli.sourceText,
      reason: line.quantityMilli.reason,
    },
    {
      label: 'Unit',
      value: line.unit.value,
      status: line.unit.status,
      confidence: line.unit.confidence,
      sourceText: line.unit.sourceText,
      reason: line.unit.reason,
    },
  ];
  return {
    lineId: line.lineId,
    spokenName: line.spokenName,
    match: { kind, productName },
    candidates: line.candidates.map((c) => ({ id: c.id, name: c.name })),
    fields,
  };
}

/** Maps the latest Order draft onto the shared Pipeline Inspector props (Req 3.9 demo-first details). */
export function toInspectorProps(
  draft: OrderDraft | null,
): Omit<PipelineInspectorProps, 'defaultOpen'> {
  if (draft === null) return { raw: '', normalized: null, lines: [] };
  const n = normalize(draft.rawTranscript);
  return {
    raw: draft.rawTranscript,
    normalized: { text: draft.normalizedText, tokens: n.tokens },
    lines: draft.lines.map(toInspectorLine),
  };
}
