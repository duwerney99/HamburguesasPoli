import { PaymentStatusValueObject } from './payment-status.value-object.js';

/**
 * ENTIDAD DE DOMINIO: Registro de Venta / Pedido de Campaña (Módulo Sales)
 */
export class SaleEntity {
  constructor({
    id,
    campaignId = null,
    campaignName = null,
    customerName = 'Cliente',
    customerEmail = '',
    totalCop = 0,
    paymentStatus = 'UNPAID',
    status = 'PENDING'
  }) {
    this.id = id;
    this.campaignId = campaignId;
    this.campaignName = campaignName;
    this.customerName = customerName;
    this.customerEmail = customerEmail;
    this.totalCop = Number(totalCop || 0);
    this.paymentStatusVO = new PaymentStatusValueObject(paymentStatus);
    this.paymentStatus = this.paymentStatusVO.toString();
    this.status = status;
  }
}

