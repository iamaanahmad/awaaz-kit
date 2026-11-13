import { z } from 'zod';

/** A problem that stops (or warns about) confirming a draft. */
export interface ValidationIssue {
  code: string;
  lineId?: string;
  field?: string;
  message: string;
}

export const validationIssueSchema: z.ZodType<ValidationIssue> = z.object({
  code: z.string().min(1),
  lineId: z.string().optional(),
  field: z.string().optional(),
  message: z.string(),
});

/** Minimal customer shape the engine needs; domain packages may pass richer records. */
export interface CustomerRef {
  id: string;
  name: string;
  phone?: string;
}

/**
 * Structural view of the catalog index. The real `CatalogIndex` from
 * `catalog-matcher` is assignable to this, so the engine stays decoupled.
 */
export interface CatalogLookup {
  match(phrase: string): unknown;
}

export interface WorkflowContext<TCatalog extends CatalogLookup = CatalogLookup> {
  shopId: string;
  customers: readonly CustomerRef[];
  catalog: TCatalog;
  makeId: () => string;
  now: () => Date;
  config: { taxEnabled: boolean };
}

/** Contract each workflow (order, bill, ...) implements on top of the shared pipeline. */
export interface WorkflowAdapter<TDraft, TCatalog extends CatalogLookup = CatalogLookup> {
  readonly id: 'order' | 'bill';
  parse(text: string, context: WorkflowContext<TCatalog>): TDraft;
  validate(draft: TDraft): ValidationIssue[];
  /**
   * Must equal `validate(draft).length === 0 && draft has at least one line`,
   * with every required field confirmed.
   */
  canConfirm(draft: TDraft): boolean;
}

export interface ReviewPayload<TDraft> {
  draft: TDraft;
  revision: number;
  issues: ValidationIssue[];
  canConfirm: boolean;
}

/** Pure: builds the data the Review_Card shows. Writes nothing. */
export function buildReview<TDraft, TCatalog extends CatalogLookup = CatalogLookup>(
  adapter: WorkflowAdapter<TDraft, TCatalog>,
  draft: TDraft,
  revision: number,
): ReviewPayload<TDraft> {
  return {
    draft,
    revision,
    issues: adapter.validate(draft),
    canConfirm: adapter.canConfirm(draft),
  };
}
