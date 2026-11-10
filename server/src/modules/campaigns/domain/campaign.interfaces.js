/**
 * INTERFACES / CONTRATOS DE DOMINIO: Módulo Campaigns & Votes
 */
export const CAMPAIGN_REPOSITORY_INTERFACE = [
  'list',
  'findById',
  'findActive',
  'hasOverlappingPublished',
  'create',
  'update',
  'close',
  'remove'
];

export const VOTE_REPOSITORY_INTERFACE = [
  'castVote',
  'listByCampaign',
  'listAllWithDetails',
  'findById',
  'updatePaymentAndSyncOrder'
];

