/**
 * PROYECCIONES DE DOMINIO: Módulo Campaigns
 */
export function toCampaignVoterProjection(vote) {
  return {
    voteId: vote.voteId,
    userId: vote.userId,
    customerName: vote.customerName || 'Cliente',
    customerEmail: vote.customerEmail || '',
    burgerId: vote.burgerId,
    burgerName: vote.burgerName || 'Hamburguesa',
    quantity: Number(vote.quantity || 1),
    paymentStatus: vote.paymentStatus || 'UNPAID',
    orderId: vote.orderId || null,
    votedAt: vote.votedAt || null
  };
}

