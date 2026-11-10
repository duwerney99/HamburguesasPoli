/**
 * INFRASTRUCTURE OUTBOUND ADAPTER (SQLite): Sales Repository Facade
 * Orquesta consultas de ventas sobre orders y votes en SQLite.
 */
export function createSalesSqliteAdapter({ ordersAdapter, votesAdapter, campaignsAdapter }) {
  return {
    orders: ordersAdapter,
    votes: votesAdapter,
    campaigns: campaignsAdapter
  };
}

