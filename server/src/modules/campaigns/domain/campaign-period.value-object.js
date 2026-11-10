import { DomainException } from '../../shared/domain/exceptions/domain.exception.js';

export const CAMPAIGN_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED'];

/**
 * VALUE OBJECT: Periodo de Campaña [startsAt, endsAt]
 */
export class CampaignPeriodValueObject {
  constructor(startsAt, endsAt) {
    const startMs = Date.parse(startsAt);
    const endMs = Date.parse(endsAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      throw DomainException.badRequest('Ingresa fechas válidas en formato ISO.', 'INVALID_CAMPAIGN_DATES');
    }
    if (startMs >= endMs) {
      throw DomainException.badRequest(
        'La fecha de fin debe ser posterior a la de inicio.',
        'INVALID_CAMPAIGN_RANGE'
      );
    }
    this.startsAt = new Date(startMs).toISOString();
    this.endsAt = new Date(endMs).toISOString();
  }
}

export function campaignLifecycleStatus(campaign, now = new Date()) {
  const lifecycle = campaign.status || campaign.lifecycleStatus || (campaign.published ? 'PUBLISHED' : 'DRAFT');
  if (lifecycle === 'DRAFT' || lifecycle === 'CLOSED' || lifecycle === 'CANCELLED') {
    return lifecycle;
  }
  const start = new Date(campaign.startsAt);
  const end = new Date(campaign.endsAt);
  if (now < start) return 'SCHEDULED';
  if (now >= start && now < end) return 'ACTIVE';
  return 'CLOSED';
}

export function canVoteInCampaign(campaign, now = new Date()) {
  return campaignLifecycleStatus(campaign, now) === 'ACTIVE';
}

