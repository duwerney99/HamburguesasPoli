import { CampaignPeriodValueObject, campaignLifecycleStatus } from './campaign-period.value-object.js';

/**
 * ENTIDAD DE DOMINIO: Campaña de Votación (Módulo Campaigns)
 */
export class CampaignEntity {
  constructor({
    id,
    name,
    startsAt,
    endsAt,
    published = false,
    lifecycleStatus = 'DRAFT',
    winnerBurgerId = null,
    winnerName = null,
    candidates = [],
    userVoteBurgerId = null,
    userVoteQuantity = null
  }) {
    const period = new CampaignPeriodValueObject(startsAt, endsAt);
    this.id = id;
    this.name = String(name || '').trim();
    this.startsAt = period.startsAt;
    this.endsAt = period.endsAt;
    this.published = Boolean(published);
    this.lifecycleStatus = lifecycleStatus;
    this.status = campaignLifecycleStatus({ status: lifecycleStatus, published, startsAt, endsAt });
    this.winnerBurgerId = winnerBurgerId;
    this.winnerName = winnerName;
    this.candidates = candidates;
    this.userVoteBurgerId = userVoteBurgerId;
    this.userVoteQuantity = userVoteQuantity;
  }
}

