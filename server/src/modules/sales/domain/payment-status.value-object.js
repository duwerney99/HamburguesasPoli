export const PAYMENT_STATUSES = ['UNPAID', 'PAID', 'CANCELLED'];

/**
 * VALUE OBJECT: Estado de Pago de Venta / Voto de Campaña
 */
export class PaymentStatusValueObject {
  constructor(rawStatus) {
    const normalized = String(rawStatus || 'UNPAID').trim().toUpperCase();
    this.value = PAYMENT_STATUSES.includes(normalized) ? normalized : 'UNPAID';
  }

  isPaid() {
    return this.value === 'PAID';
  }

  toString() {
    return this.value;
  }
}

export function normalizePaymentStatus(status) {
  return new PaymentStatusValueObject(status).toString();
}

