/**
 * CAPA DE DOMINIO (Arquitectura Hexagonal)
 * Entidades, Objetos de Valor y Reglas de Negocio puras (sin dependencias de frameworks ni bases de datos).
 */

export const ROLES = Object.freeze(['CLIENT', 'CHEF', 'ADMIN']);

export const ORDER_STATUSES = Object.freeze([
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'DELIVERED',
  'CANCELLED'
]);

export const PAYMENT_STATUSES = Object.freeze(['UNPAID', 'PAID', 'CANCELLED']);

export const CAMPAIGN_STATUSES = Object.freeze([
  'DRAFT',
  'PUBLISHED',
  'SCHEDULED',
  'ACTIVE',
  'CLOSED',
  'CANCELLED'
]);

export const ORDER_TRANSITIONS = Object.freeze({
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY'],
  READY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: []
});

export function computeCampaignStatus(campaign, now = new Date()) {
  if (
    campaign.status === 'CANCELLED' ||
    campaign.status === 'CLOSED' ||
    campaign.status === 'DRAFT'
  ) {
    return campaign.status;
  }
  const instant = now.getTime();
  if (instant < Date.parse(campaign.startsAt)) return 'SCHEDULED';
  if (instant >= Date.parse(campaign.endsAt)) return 'CLOSED';
  return 'ACTIVE';
}

export function resolveOrderPaymentStatus(rawPaymentStatus, orderStatus) {
  if (orderStatus === 'CANCELLED' || rawPaymentStatus === 'CANCELLED') return 'CANCELLED';
  if (
    rawPaymentStatus === 'PAID' ||
    ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'].includes(orderStatus)
  ) {
    return 'PAID';
  }
  return 'UNPAID';
}

export function computeCampaignWinner(candidates = []) {
  if (!candidates.length) return null;
  return [...candidates].sort(
    (a, b) =>
      Number(b.voteCount || 0) - Number(a.voteCount || 0) ||
      Number(b.desiredQuantity || 0) - Number(a.desiredQuantity || 0) ||
      String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
  )[0];
}

export function formatPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.app_role || user.role || 'CLIENT'
  };
}

export function canTransitionOrderStatus(currentStatus, nextStatus) {
  return Boolean(ORDER_TRANSITIONS[currentStatus]?.includes(nextStatus));
}

export function computeNextOrderAndPaymentState(currentOrder, { paymentStatus, status }) {
  let nextPaymentStatus = paymentStatus || currentOrder.paymentStatus || 'UNPAID';
  let nextStatus = status || currentOrder.status || 'PENDING';

  if (paymentStatus === 'CANCELLED' || status === 'CANCELLED') {
    nextPaymentStatus = 'CANCELLED';
    nextStatus = 'CANCELLED';
  } else if (paymentStatus === 'PAID') {
    nextPaymentStatus = 'PAID';
    if (!status && (currentOrder.status === 'PENDING' || currentOrder.status === 'CANCELLED')) {
      nextStatus = 'CONFIRMED';
    }
  } else if (paymentStatus === 'UNPAID') {
    nextPaymentStatus = 'UNPAID';
    if (!status) {
      nextStatus = 'PENDING';
    }
  } else if (status && ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'].includes(status)) {
    nextPaymentStatus = 'PAID';
  }

  return { nextStatus, nextPaymentStatus };
}

/**
 * Calcula el tablero de producción del Chef y el desglose por cliente exclusivamente con pedidos pagados.
 */
export function computeKitchenProduction(allOrders = []) {
  const paidOrders = allOrders.filter(
    order =>
      resolveOrderPaymentStatus(order.rawPaymentStatus || order.paymentStatus, order.status) ===
        'PAID' && order.status !== 'CANCELLED'
  );

  const byBurgerMap = new Map();
  const byClientMap = new Map();

  let totalBurgersToMake = 0;
  let totalBurgersQueued = 0;
  let totalBurgersInGrill = 0;
  let totalBurgersReady = 0;
  let totalBurgersDelivered = 0;
  let totalBurgersPaid = 0;

  for (const order of paidOrders) {
    const isQueued = order.status === 'CONFIRMED' || order.status === 'PENDING';
    const isPreparing = order.status === 'PREPARING';
    const isToMake = isQueued || isPreparing;
    const isReady = order.status === 'READY';
    const isDelivered = order.status === 'DELIVERED';

    let clientEntry = byClientMap.get(String(order.userId));
    if (!clientEntry) {
      clientEntry = {
        userId: order.userId,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        phone: order.phone,
        deliveryAddress: order.deliveryAddress,
        paidOrdersCount: 0,
        totalBurgers: 0,
        burgersToMake: 0,
        burgersReady: 0,
        burgersDelivered: 0,
        totalPaidCop: 0,
        latestOrderAt: order.createdAt,
        latestStatus: order.status,
        itemsMap: new Map(),
        orders: []
      };
      byClientMap.set(String(order.userId), clientEntry);
    }

    clientEntry.paidOrdersCount += 1;
    clientEntry.totalPaidCop += Number(order.totalCop || 0);
    if (String(order.createdAt) > String(clientEntry.latestOrderAt)) {
      clientEntry.latestOrderAt = order.createdAt;
      clientEntry.latestStatus = order.status;
    }

    const items = order.items || [];
    const orderTotalBurgers =
      order.totalBurgers ?? items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    clientEntry.orders.push({
      id: order.id,
      status: order.status,
      paymentStatus: 'PAID',
      totalCop: Number(order.totalCop || 0),
      totalBurgers: orderTotalBurgers,
      campaignName: order.campaignName || null,
      createdAt: order.createdAt
    });

    for (const item of items) {
      const qty = Number(item.quantity || 0);
      totalBurgersPaid += qty;
      if (isToMake) totalBurgersToMake += qty;
      if (isQueued) totalBurgersQueued += qty;
      if (isPreparing) totalBurgersInGrill += qty;
      if (isReady) totalBurgersReady += qty;
      if (isDelivered) totalBurgersDelivered += qty;

      clientEntry.totalBurgers += qty;
      if (isToMake) clientEntry.burgersToMake += qty;
      if (isReady) clientEntry.burgersReady += qty;
      if (isDelivered) clientEntry.burgersDelivered += qty;

      const burgerKey = String(item.burgerId);
      const existingClientBurger = clientEntry.itemsMap.get(burgerKey) || {
        burgerId: item.burgerId,
        burgerName: item.burgerName,
        burgerImageUrl: item.burgerImageUrl || '/assets/hero-burger.jpeg',
        quantity: 0
      };
      existingClientBurger.quantity += qty;
      clientEntry.itemsMap.set(burgerKey, existingClientBurger);

      let burgerEntry = byBurgerMap.get(burgerKey);
      if (!burgerEntry) {
        burgerEntry = {
          burgerId: item.burgerId,
          burgerName: item.burgerName,
          burgerImageUrl: item.burgerImageUrl || '/assets/hero-burger.jpeg',
          ingredients: Array.isArray(item.ingredients)
            ? item.ingredients.join(', ')
            : item.ingredients,
          toMakeQuantity: 0,
          queuedQuantity: 0,
          preparingQuantity: 0,
          readyQuantity: 0,
          deliveredQuantity: 0,
          totalPaidQuantity: 0,
          ordersCount: 0,
          requests: []
        };
        byBurgerMap.set(burgerKey, burgerEntry);
      }

      burgerEntry.totalPaidQuantity += qty;
      if (isToMake) burgerEntry.toMakeQuantity += qty;
      if (isQueued) burgerEntry.queuedQuantity += qty;
      if (isPreparing) burgerEntry.preparingQuantity += qty;
      if (isReady) burgerEntry.readyQuantity += qty;
      if (isDelivered) burgerEntry.deliveredQuantity += qty;
      burgerEntry.ordersCount += 1;
      burgerEntry.requests.push({
        orderId: order.id,
        customerName: order.customerName,
        quantity: qty,
        status: order.status,
        removedIngredients: item.removedIngredients || [],
        notes: item.notes || ''
      });
    }
  }

  const byBurger = Array.from(byBurgerMap.values()).sort(
    (a, b) =>
      b.toMakeQuantity - a.toMakeQuantity ||
      b.readyQuantity - a.readyQuantity ||
      b.totalPaidQuantity - a.totalPaidQuantity
  );

  const clientBreakdown = Array.from(byClientMap.values())
    .map(({ itemsMap, ...client }) => ({
      ...client,
      itemsSummary: Array.from(itemsMap.values()).sort((a, b) => b.quantity - a.quantity)
    }))
    .sort(
      (a, b) =>
        b.burgersToMake - a.burgersToMake ||
        b.totalBurgers - a.totalBurgers ||
        b.totalPaidCop - a.totalPaidCop
    );

  return {
    paidOrders,
    productionSummary: {
      totalPaidOrders: paidOrders.length,
      activePaidOrders: paidOrders.filter(order => order.status !== 'DELIVERED').length,
      totalBurgersToMake,
      totalBurgersQueued,
      totalBurgersInGrill,
      totalBurgersReady,
      totalBurgersDelivered,
      totalBurgersPaid,
      byBurger
    },
    clientBreakdown
  };
}

