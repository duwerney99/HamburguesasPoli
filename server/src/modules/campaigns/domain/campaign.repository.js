import {
  CAMPAIGN_REPOSITORY_INTERFACE,
  VOTE_REPOSITORY_INTERFACE
} from './campaign.interfaces.js';

/**
 * REPOSITORY PORT: Puerto de persistencia de Campañas y Votos
 */
export function assertCampaignRepositoryPort(port) {
  for (const method of CAMPAIGN_REPOSITORY_INTERFACE) {
    if (!port || typeof port[method] !== 'function') {
      throw new Error(`CampaignRepositoryPort incumple el método requerido: campaigns.${method}()`);
    }
  }
  return port;
}

export function assertVoteRepositoryPort(port) {
  for (const method of VOTE_REPOSITORY_INTERFACE) {
    if (!port || typeof port[method] !== 'function') {
      throw new Error(`VoteRepositoryPort incumple el método requerido: votes.${method}()`);
    }
  }
  return port;
}

