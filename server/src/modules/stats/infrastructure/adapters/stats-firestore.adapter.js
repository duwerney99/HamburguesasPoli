import { ORDER_STATUSES } from '../../../orders/domain/order-status.value-object.js';
import { USER_ROLES } from '../../../users/domain/role.value-object.js';
import { buildTopProductsByVotePercentageProjection } from '../../domain/stats.projections.js';

/**
 * INFRASTRUCTURE OUTBOUND ADAPTER (Firestore): Stats Repository
 */
export function createStatsFirestoreAdapter({
  campaignsAdapter,
  usersAdapter,
  burgersAdapter,
  ordersAdapter,
  votesAdapter,
  auditAdapter
}) {
  return {
    async getAdminDashboardStats() {
      const [campaigns, usersPage, burgers, orders, allVotes, recentAudit] = await Promise.all([
        campaignsAdapter.list(),
        usersAdapter.listPaginated({ pageSize: 1000 }),
        burgersAdapter.list({ includeInactive: true }),
        ordersAdapter.listAll(),
        votesAdapter.listAllWithDetails(),
        auditAdapter.list(10)
      ]);

      const activeCampaign = campaigns.find(c => c.status === 'ACTIVE') ?? null;
      const totalVotes = allVotes.length;
      const totalDesiredBurgers = allVotes.reduce((sum, v) => sum + Number(v.quantity || 1), 0);

      const topVotedBurgers = burgers
        .map(b => {
          const bVotes = allVotes.filter(v => String(v.burgerId) === String(b.id));
          return {
            id: b.id,
            name: b.name,
            priceCop: b.priceCop,
            votesCount: bVotes.length,
            desiredQuantity: bVotes.reduce((s, v) => s + Number(v.quantity || 1), 0),
            orderedQuantity: 0
          };
        })
        .sort((a, b) => b.votesCount - a.votesCount)
        .slice(0, 6);

      const topProductsByVotePercentage = buildTopProductsByVotePercentageProjection(
        topVotedBurgers,
        totalVotes
      );

      const currentCampaignTarget =
        activeCampaign ?? campaigns.find(c => c.status === 'SCHEDULED') ?? campaigns[0] ?? null;

      let currentCampaignSummary = null;
      if (currentCampaignTarget) {
        const sortedCandidates = [...(currentCampaignTarget.candidates || [])].sort(
          (a, b) => b.voteCount - a.voteCount
        );
        const totalCampaignVotes = sortedCandidates.reduce((acc, c) => acc + c.voteCount, 0);
        const totalCampaignDesired = sortedCandidates.reduce(
          (acc, c) => acc + (c.desiredQuantity ?? c.voteCount),
          0
        );
        const leadingBurger = sortedCandidates[0] ?? null;

        currentCampaignSummary = {
          id: currentCampaignTarget.id,
          name: currentCampaignTarget.name,
          status: currentCampaignTarget.status,
          startsAt: currentCampaignTarget.startsAt,
          endsAt: currentCampaignTarget.endsAt,
          totalVotes: totalCampaignVotes,
          totalDesiredBurgers: totalCampaignDesired,
          candidatesCount: sortedCandidates.length,
          leadingBurger: leadingBurger
            ? {
                id: leadingBurger.id,
                name: leadingBurger.name,
                voteCount: leadingBurger.voteCount,
                desiredQuantity: leadingBurger.desiredQuantity ?? leadingBurger.voteCount,
                sharePercentage:
                  totalCampaignVotes > 0
                    ? Number(((leadingBurger.voteCount / totalCampaignVotes) * 100).toFixed(1))
                    : 0
              }
            : null,
          candidates: sortedCandidates.map(c => ({
            id: c.id,
            name: c.name,
            voteCount: c.voteCount,
            desiredQuantity: c.desiredQuantity ?? c.voteCount,
            percentage:
              totalCampaignVotes > 0
                ? Number(((c.voteCount / totalCampaignVotes) * 100).toFixed(1))
                : 0
          }))
        };
      }

      return {
        kpis: {
          totalUsers: usersPage.counts.ALL,
          totalClients: usersPage.counts.CLIENT,
          totalStaff: usersPage.counts.STAFF,
          totalBurgers: burgers.length,
          activeBurgers: burgers.filter(b => b.active).length,
          totalCampaigns: campaigns.length,
          totalVotes,
          totalDesiredBurgers,
          totalOrders: orders.length,
          activeOrders: orders.filter(o => !['DELIVERED', 'CANCELLED'].includes(o.status)).length,
          totalRevenueCop: orders
            .filter(o => o.status !== 'CANCELLED')
            .reduce((s, o) => s + Number(o.totalCop || 0), 0),
          deliveredRevenueCop: orders
            .filter(o => o.status === 'DELIVERED')
            .reduce((s, o) => s + Number(o.totalCop || 0), 0),
          activeCampaignName: activeCampaign?.name ?? null,
          activeCampaignId: activeCampaign?.id ?? null
        },
        currentCampaignSummary,
        charts: {
          ordersByStatus: ORDER_STATUSES.map(status => ({
            status,
            count: orders.filter(o => o.status === status).length,
            revenueCop: orders
              .filter(o => o.status === status)
              .reduce((s, o) => s + Number(o.totalCop || 0), 0)
          })),
          usersByRole: USER_ROLES.map(role => ({
            role,
            count: usersPage.counts[role] || 0
          })),
          topVotedBurgers,
          topProductsByVotePercentage,
          campaignPerformance: [],
          activeCampaignBreakdown: activeCampaign?.candidates ?? []
        },
        recentAudit
      };
    }
  };
}

