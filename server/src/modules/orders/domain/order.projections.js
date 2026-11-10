/**
 * PROYECCIONES DE DOMINIO: Tablero de Producción de Cocina para el Chef
 */
export function computeKitchenProduction(orders = []) {
  const paidOrders = orders.filter(
    order =>
      (order.paymentStatus || 'PAID') === 'PAID' &&
      order.status !== 'CANCELLED'
  );

  const burgerTotalsMap = new Map();
  const clientTotalsMap = new Map();
  let totalBurgersToMake = 0;
  let totalBurgersDelivered = 0;

  for (const order of paidOrders) {
    const isActiveProduction = ['CONFIRMED', 'PREPARING', 'READY', 'PENDING'].includes(
      order.status
    );
    const isDelivered = order.status === 'DELIVERED';

    for (const item of order.items || []) {
      const qty = Number(item.quantity || 0);
      const burgerKey = String(item.burgerId);
      const existingBurger = burgerTotalsMap.get(burgerKey) || {
        burgerId: item.burgerId,
        burgerName: item.burgerName,
        ingredients: item.ingredients || '',
        toMakeQuantity: 0,
        preparingQuantity: 0,
        readyQuantity: 0,
        deliveredQuantity: 0,
        totalPaidQuantity: 0
      };

      existingBurger.totalPaidQuantity += qty;
      if (isActiveProduction) {
        existingBurger.toMakeQuantity += qty;
        totalBurgersToMake += qty;
      }
      if (order.status === 'PREPARING') existingBurger.preparingQuantity += qty;
      if (order.status === 'READY') existingBurger.readyQuantity += qty;
      if (isDelivered) {
        existingBurger.deliveredQuantity += qty;
        totalBurgersDelivered += qty;
      }
      burgerTotalsMap.set(burgerKey, existingBurger);

      const clientKey = `${order.userId || order.customerEmail || order.customerName}`;
      const existingClient = clientTotalsMap.get(clientKey) || {
        userId: order.userId,
        customerName: order.customerName || 'Cliente',
        customerEmail: order.customerEmail || '',
        phone: order.phone || '',
        deliveryAddress: order.deliveryAddress || '',
        totalBurgers: 0,
        totalCop: 0,
        ordersCount: 0,
        itemsSummary: []
      };
      existingClient.totalBurgers += qty;
      existingClient.itemsSummary.push({
        orderId: order.id,
        burgerName: item.burgerName,
        quantity: qty,
        status: order.status,
        paymentStatus: order.paymentStatus || 'PAID'
      });
      clientTotalsMap.set(clientKey, existingClient);
    }

    const clientKey = `${order.userId || order.customerEmail || order.customerName}`;
    if (clientTotalsMap.has(clientKey)) {
      const entry = clientTotalsMap.get(clientKey);
      entry.totalCop += Number(order.totalCop || 0);
      entry.ordersCount += 1;
    }
  }

  return {
    paidOrders,
    productionSummary: {
      totalPaidOrders: paidOrders.length,
      activeKitchenOrders: paidOrders.filter(o =>
        ['CONFIRMED', 'PREPARING', 'READY', 'PENDING'].includes(o.status)
      ).length,
      totalBurgersToMake,
      totalBurgersDelivered,
      byBurger: Array.from(burgerTotalsMap.values()).sort(
        (a, b) => b.toMakeQuantity - a.toMakeQuantity || b.totalPaidQuantity - a.totalPaidQuantity
      )
    },
    clientBreakdown: Array.from(clientTotalsMap.values()).sort(
      (a, b) => b.totalBurgers - a.totalBurgers
    )
  };
}

