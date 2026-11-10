/**
 * APPLICATION LAYER: Casos de Uso del Módulo Campaigns
 * Ubicación: server/src/modules/campaigns/application/campaigns.use-cases.js
 */
import { computeCampaignWinner } from '../../../hexagonal/domain/entities.js';
import { CampaignNotFoundException } from '../domain/campaign.exceptions.js';
import { DomainException } from '../../shared/domain/exceptions/domain.exception.js';

export function createCampaignsUseCases({ ports }) {
  async function validateAndPersistCampaign({ id = null, data, actorUserId, updating = false }) {
    const uniqueIds = [...new Set(data.burgerIds)];
    if (uniqueIds.length !== data.burgerIds.length) {
      throw DomainException.badRequest('No repitas candidatas.', 'DUPLICATE_CANDIDATES');
    }

    const activeCount = await ports.burgers.countActiveByIds(uniqueIds);
    if (activeCount !== uniqueIds.length) {
      throw DomainException.badRequest(
        'Alguna hamburguesa no existe o está inactiva.',
        'INVALID_CANDIDATE_BURGER'
      );
    }

    if (data.status === 'PUBLISHED') {
      const overlapping = await ports.campaigns.findOverlappingPublished({
        excludeId: updating ? id : 0,
        startsAt: data.startsAt,
        endsAt: data.endsAt
      });
      if (overlapping) {
        throw DomainException.conflict(
          'Ya existe una campaña publicada que se cruza con esas fechas.',
          'CAMPAIGN_OVERLAP'
        );
      }
    }

    if (updating) {
      const current = await ports.campaigns.getMetaForUpdate(id);
      if (!current) {
        throw new CampaignNotFoundException();
      }
      if (
        current.voteCount > 0 ||
        (current.status === 'PUBLISHED' && Date.now() >= Date.parse(current.startsAt))
      ) {
        throw DomainException.conflict(
          'Una campaña iniciada o con votos ya no puede modificar fechas ni candidatas.',
          'CAMPAIGN_LOCKED'
        );
      }
      const updated = await ports.campaigns.update(
        id,
        { ...data, burgerIds: uniqueIds },
        actorUserId
      );
      if (!updated) {
        throw new CampaignNotFoundException();
      }
      return updated;
    }

    return ports.campaigns.create({ ...data, burgerIds: uniqueIds }, actorUserId);
  }

  return {
    async list({ userId, isAdmin = false } = {}) {
      const all = await ports.campaigns.list(userId);
      return all.filter(item => item.published || isAdmin);
    },

    async getActive(userId) {
      const all = await ports.campaigns.list(userId);
      const active = all.find(item => item.published && item.status === 'ACTIVE');
      if (!active) {
        throw DomainException.notFound('No hay una campaña activa.', 'NO_ACTIVE_CAMPAIGN');
      }
      return active;
    },

    async create(data, actorUserId) {
      return validateAndPersistCampaign({ data, actorUserId, updating: false });
    },

    async update(id, data, actorUserId) {
      return validateAndPersistCampaign({ id, data, actorUserId, updating: true });
    },

    async close(id, actorUserId) {
      const current = await ports.campaigns.get(id);
      if (!current) {
        throw new CampaignNotFoundException();
      }
      if (current.lifecycleStatus !== 'PUBLISHED') {
        throw DomainException.conflict(
          'Sólo se puede cerrar una campaña publicada.',
          'CAMPAIGN_NOT_PUBLISHED'
        );
      }
      const winner = computeCampaignWinner(current.candidates);
      if (!winner) {
        throw DomainException.conflict('La campaña no tiene candidatas.', 'CAMPAIGN_EMPTY');
      }
      const closedCampaign = await ports.campaigns.close(id, winner.id, actorUserId);
      return { campaign: closedCampaign, winner };
    },

    async castVote({ campaignId, burgerId, quantity = 1, userId }) {
      await ports.votes.create({ campaignId, burgerId, quantity, userId });
      const campaign = await ports.campaigns.get(campaignId, userId);
      const message =
        quantity === 1
          ? 'Tu voto por 1 hamburguesa fue registrado.'
          : `Tu voto y tu solicitud de ${quantity} hamburguesas fueron registrados.`;
      return { message, campaign };
    },

    async listVotes(campaignId) {
      const campaign = await ports.campaigns.get(campaignId);
      if (!campaign) {
        throw new CampaignNotFoundException();
      }
      const votes = await ports.campaigns.listVotes(campaignId);
      return { campaignId: campaign.id, votes };
    }
  };
}
