/**
 * PROYECCIONES DE DOMINIO: Módulo Sales
 */
export function buildSalesSummaryProjection({ sales, campaignOrders }) {
  const paidSales = sales.filter(s => s.paymentStatus === 'PAID' && s.status !== 'CANCELLED');
  const paidRevenueCop = paidSales.reduce((acc, s) => acc + Number(s.totalCop || 0), 0);
  const unpaidOrdersCount =
    sales.filter(s => s.paymentStatus === 'UNPAID' && s.status !== 'CANCELLED').length +
    campaignOrders.filter(v => v.paymentStatus === 'UNPAID').length;
  const cancelledOrdersCount =
    sales.filter(s => s.paymentStatus === 'CANCELLED' || s.status === 'CANCELLED').length +
    campaignOrders.filter(v => v.paymentStatus === 'CANCELLED').length;

  return {
    totalSalesOrders: sales.length,
    paidOrdersCount: paidSales.length,
    unpaidOrdersCount,
    cancelledOrdersCount,
    paidRevenueCop,
    campaignVotesCount: campaignOrders.length,
    campaignPaidVotesCount: campaignOrders.filter(v => v.paymentStatus === 'PAID').length,
    campaignPendingVotesCount: campaignOrders.filter(v => v.paymentStatus === 'UNPAID').length,
    campaignPotentialCop: campaignOrders.reduce((acc, v) => acc + Number(v.totalCop || 0), 0),
    campaignPaidCop: campaignOrders
      .filter(v => v.paymentStatus === 'PAID')
      .reduce((acc, v) => acc + Number(v.totalCop || 0), 0)
  };
}

