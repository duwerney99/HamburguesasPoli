import { OrderStatusValueObject } from './order-status.value-object.js';

/**
 * ENTIDAD DE DOMINIO: Pedido (Módulo Orders & Kitchen)
 */
export class OrderEntity {
  constructor({
    id,
    userId,
    campaignId = null,
    status = 'CONFIRMED',
    paymentStatus = 'PAID',
    phone = '',
    deliveryAddress = '',
    notes = '',
    totalCop = 0,
    items = [],
    customerName = '',
    customerEmail = '',
    createdAt = null
  }) {
    this.id = id;
    this.userId = userId;
    this.campaignId = campaignId;
    this.statusVO = new OrderStatusValueObject(status);
    this.status = this.statusVO.toString();
    this.paymentStatus = paymentStatus;
    this.phone = phone;
    this.deliveryAddress = deliveryAddress;
    this.notes = notes;
    this.totalCop = Number(totalCop || 0);
    this.items = items;
    this.customerName = customerName;
    this.customerEmail = customerEmail;
    this.createdAt = createdAt;
  }
}

