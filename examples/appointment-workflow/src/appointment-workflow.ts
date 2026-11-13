import type { CatalogIndex } from '@awaaz-kit/catalog-matcher';
import { resolveLines, type ResolvedLine } from '@awaaz-kit/confidence-engine';
import type {
  ValidationIssue,
  WorkflowAdapter,
  WorkflowContext,
} from '@awaaz-kit/confirmation-engine';
import { extract } from '@awaaz-kit/intent-engine';
import { normalize } from '@awaaz-kit/language-normalizer';

/** A draft appointment: the shared pipeline's lines are the services requested. */
export interface AppointmentDraft {
  id: string;
  shopId: string;
  services: ResolvedLine[];
  rawTranscript: string;
}

export class AppointmentWorkflowAdapter implements WorkflowAdapter<AppointmentDraft, CatalogIndex> {
  // The WorkflowAdapter contract currently names only the built-in workflows.
  readonly id = 'order' as const;

  parse(text: string, ctx: WorkflowContext<CatalogIndex>): AppointmentDraft {
    // Same shared pipeline as Order and Bill: normalize -> extract -> resolve.
    const extraction = extract(normalize(text), { locale: 'hi-IN', knownCustomerNames: [] });
    const services = resolveLines(extraction, ctx.catalog, ctx.makeId);
    return { id: ctx.makeId(), shopId: ctx.shopId, services, rawTranscript: text };
  }

  validate(draft: AppointmentDraft): ValidationIssue[] {
    return draft.services
      .filter((s) => s.product.value === null || s.product.status !== 'confirmed')
      .map((s) => ({
        code: 'service_unresolved',
        lineId: s.lineId,
        field: 'product',
        message: 'Choose a service from the catalog.',
      }));
  }

  canConfirm(draft: AppointmentDraft): boolean {
    return draft.services.length > 0 && this.validate(draft).length === 0;
  }
}
