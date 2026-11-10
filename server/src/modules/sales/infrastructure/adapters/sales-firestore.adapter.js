/**
 * INFRASTRUCTURE OUTBOUND ADAPTER (Firestore): Sales Repository Facade
 * Orquesta consultas de ventas sobre orders y votes en Firestore.
 */
export function createSalesFirestoreAdapter({ ordersAdapter, votesAdapter, campaignsAdapter }) {
  return {
    orders: ordersAdapter,
    votes: votesAdapter,
    campaigns: campaignsAdapter
  };
}

