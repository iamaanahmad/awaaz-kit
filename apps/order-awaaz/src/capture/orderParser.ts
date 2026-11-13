import { buildIndex } from '@awaaz-kit/catalog-matcher';
import { OrderWorkflowAdapter, setOrderCustomer, type OrderDraft } from '@awaaz-kit/domain-order';
import type { CustomerRecord, ProductRecord } from '@awaaz-kit/local-data';

export interface OrderParserInput {
  shopId: string;
  products: readonly ProductRecord[];
  customers: readonly CustomerRecord[];
  /** Customer chosen on the Capture screen; null means Walk-in. */
  selectedCustomerId: string | null;
  makeId?: () => string;
  now?: () => Date;
}

const adapter = new OrderWorkflowAdapter();

/**
 * Builds the parser the capture session runs on every transcript change:
 * normalize -> extract -> resolveLines through `OrderWorkflowAdapter.parse`.
 * Pure with respect to storage: it reads the supplied catalog and writes nothing (Req 11.6).
 */
export function createOrderParser(input: OrderParserInput): (transcript: string) => OrderDraft {
  const catalog = buildIndex(input.shopId, input.products);
  const customers = input.customers
    .filter((c) => c.deletedAt === null)
    .map((c) =>
      c.phone === undefined
        ? { id: c.id, name: c.name }
        : { id: c.id, name: c.name, phone: c.phone },
    );
  const makeId = input.makeId ?? ((): string => crypto.randomUUID());
  const now = input.now ?? ((): Date => new Date());

  return (transcript) => {
    const draft = adapter.parse(transcript, {
      shopId: input.shopId,
      customers,
      catalog,
      makeId,
      now,
      config: { taxEnabled: false },
    });
    // An explicit choice on the screen wins over a name inferred from the utterance.
    return input.selectedCustomerId === null
      ? draft
      : setOrderCustomer(draft, input.selectedCustomerId);
  };
}
