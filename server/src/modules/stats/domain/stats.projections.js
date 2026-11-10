import { PercentageShareValueObject } from './percentage-share.value-object.js';

/**
 * PROYECCIONES DE DOMINIO: Cálculo de Top 5 productos en % y resumen de campaña actual
 */
export function buildTopProductsByVotePercentageProjection(products = [], totalVotes = 0) {
  return [...products]
    .sort((a, b) => Number(b.votesCount || 0) - Number(a.votesCount || 0) || Number(a.id) - Number(b.id))
    .slice(0, 5)
    .map(row => {
      const votesCount = Number(row.votesCount || 0);
      return {
        id: row.id,
        name: row.name,
        votesCount,
        desiredQuantity: Number(row.desiredQuantity || 0),
        percentage: new PercentageShareValueObject(votesCount, totalVotes).toNumber()
      };
    });
}

