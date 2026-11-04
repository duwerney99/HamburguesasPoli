export const COLLECTIONS = Object.freeze({
  users: 'users',
  roles: 'roles',
  burgers: 'burgers',
  campaigns: 'campaigns',
  votes: 'votes',
  orders: 'orders',
  auditLogs: 'auditLogs'
});

export const SUBCOLLECTIONS = Object.freeze({
  campaignCandidates: 'candidates',
  orderItems: 'items',
  orderEvents: 'events'
});

export const ROLES = Object.freeze(['CLIENT', 'CHEF', 'ADMIN']);
export const ORDER_STATUSES = Object.freeze(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED']);
export const CAMPAIGN_STATUSES = Object.freeze(['DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED']);

export const documentIds = Object.freeze({
  user: value => String(value),
  burger: value => String(value),
  campaign: value => String(value),
  order: value => String(value),
  vote: (campaignId, userId) => `${campaignId}_${userId}`
});
