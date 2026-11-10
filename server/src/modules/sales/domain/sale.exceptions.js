import { DomainException } from '../../shared/domain/exceptions/domain.exception.js';

/**
 * EXCEPCIONES DE DOMINIO: Módulo Sales
 */
export class CampaignVoteOrderNotFoundException extends DomainException {
  constructor() {
    super('Pedido de campaña no encontrado.', {
      code: 'CAMPAIGN_VOTE_NOT_FOUND',
      status: 404
    });
  }
}

