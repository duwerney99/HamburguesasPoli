import { DomainException } from '../../shared/domain/exceptions/domain.exception.js';

/**
 * EXCEPCIONES DE DOMINIO: Módulo Campaigns
 */
export class CampaignNotFoundException extends DomainException {
  constructor() {
    super('Campaña no encontrada.', { code: 'CAMPAIGN_NOT_FOUND', status: 404 });
  }
}

export class OverlappingPublishedCampaignException extends DomainException {
  constructor() {
    super('Ya existe otra campaña publicada que se cruza con ese rango de fechas.', {
      code: 'OVERLAPPING_CAMPAIGN',
      status: 409
    });
  }
}

export class InvalidCampaignCandidatesException extends DomainException {
  constructor() {
    super('Selecciona hamburguesas activas existentes.', {
      code: 'INVALID_CANDIDATE_BURGERS',
      status: 400
    });
  }
}

export class CampaignVotingClosedException extends DomainException {
  constructor() {
    super('La votación no está activa para esta campaña.', {
      code: 'CAMPAIGN_NOT_ACTIVE',
      status: 409
    });
  }
}

