import { listCampaigns } from '../../../../db.js';
import { listAudit } from '../../../audit.js';
import { ORDER_STATUSES } from '../../../orders/domain/order-status.value-object.js';
import { USER_ROLES } from '../../../users/domain/role.value-object.js';
import { buildTopProductsByVotePercentageProjection } from '../../domain/stats.projections.js';

/**
 * INFRASTRUCTURE OUTBOUND ADAPTER (SQLite): Stats Repository
 */
export function createStatsSqliteAdapter(db) {
  return {
    async getAdminDashboardStats() {
      const campaigns = listCampaigns(db);
      const activeCampaign = campaigns.find(c => c.status === 'ACTIVE') ?? null;

      const kpiRow = db
        .prepare(
          `SELECT
            (SELECT COUNT(*) FROM users) totalUsers,
            (SELECT COUNT(*) FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id WHERE COALESCE(ur.role, u.role) = 'CLIENT') totalClients,
            (SELECT COUNT(*) FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id WHERE COALESCE(ur.role, u.role) IN ('ADMIN', 'CHEF')) totalStaff,
            (SELECT COUNT(*) FROM burgers WHERE deleted_at IS NULL) totalBurgers,
            (SELECT COUNT(*) FROM burgers WHERE active = 1 AND deleted_at IS NULL) activeBurgers,
            (SELECT COUNT(*) FROM campaigns) totalCampaigns,
            (SELECT COUNT(*) FROM votes) totalVotes,
            (SELECT COALESCE(SUM(quantity), 0) FROM votes) totalDesiredBurgers,
            (SELECT COUNT(*) FROM orders) totalOrders,
            (SELECT COUNT(*) FROM orders WHERE status NOT IN ('DELIVERED', 'CANCELLED')) activeOrders,
            (SELECT COALESCE(SUM(total_cop), 0) FROM orders WHERE status != 'CANCELLED') totalRevenueCop,
            (SELECT COALESCE(SUM(total_cop), 0) FROM orders WHERE status = 'DELIVERED') deliveredRevenueCop`
        )
        .get();

      const ordersByStatusRows = db
        .prepare('SELECT status, COUNT(*) count, COALESCE(SUM(total_cop), 0) revenueCop FROM orders GROUP BY status')
        .all();
      const ordersByStatusMap = new Map(ordersByStatusRows.map(r => [r.status, r]));
      const ordersByStatus = ORDER_STATUSES.map(status => ({
        status,
        count: Number(ordersByStatusMap.get(status)?.count ?? 0),
        revenueCop: Number(ordersByStatusMap.get(status)?.revenueCop ?? 0)
      }));

      const usersByRoleRows = db
        .prepare(
          `SELECT COALESCE(ur.role, u.role) role, COUNT(*) count
           FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id
           GROUP BY COALESCE(ur.role, u.role)`
        )
        .all();
      const usersByRoleMap = new Map(usersByRoleRows.map(r => [r.role, Number(r.count)]));
      const usersByRole = USER_ROLES.map(role => ({
        role,
        count: usersByRoleMap.get(role) ?? 0
      }));

      const topVotedBurgers = db
        .prepare(
          `SELECT b.id,
                  b.name,
                  b.price_cop priceCop,
                  COUNT(v.id) votesCount,
                  COALESCE(SUM(v.quantity), 0) desiredQuantity,
                  (SELECT COALESCE(SUM(oi.quantity), 0)
                   FROM order_items oi
                   JOIN orders o ON o.id = oi.order_id
                   WHERE oi.burger_id = b.id AND o.status != 'CANCELLED') orderedQuantity
           FROM burgers b
           LEFT JOIN votes v ON v.burger_id = b.id
           WHERE b.deleted_at IS NULL
           GROUP BY b.id
           ORDER BY votesCount DESC, desiredQuantity DESC, orderedQuantity DESC, b.id ASC
           LIMIT 6`
        )
        .all();

      const totalVotesCount = Number(kpiRow.totalVotes || 0);
      const topProductsByVotePercentage = buildTopProductsByVotePercentageProjection(
        topVotedBurgers,
        totalVotesCount
      );

      const currentCampaignTarget =
        activeCampaign ??
        campaigns.find(c => c.status === 'SCHEDULED') ??
        campaigns[0] ??
        null;

      let currentCampaignSummary = null;
      if (currentCampaignTarget) {
        const sortedCandidates = [...(currentCampaignTarget.candidates || [])].sort(
          (a, b) =>
            b.voteCount - a.voteCount ||
            (b.desiredQuantity ?? 0) - (a.desiredQuantity ?? 0) ||
            a.id - b.id
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

      const campaignPerformance = campaigns.slice(0, 6).map(campaign => {
        const totalVotes = campaign.candidates.reduce((sum, c) => sum + c.voteCount, 0);
        const desiredBurgers = campaign.candidates.reduce(
          (sum, c) => sum + (c.desiredQuantity ?? c.voteCount),
          0
        );
        return {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          totalVotes,
          desiredBurgers,
          candidatesCount: campaign.candidates.length,
          winnerName: campaign.winnerName ?? null
        };
      });

      const activeCampaignBreakdown = (activeCampaign?.candidates ?? []).map(candidate => ({
        id: candidate.id,
        name: candidate.name,
        voteCount: candidate.voteCount,
        desiredQuantity: candidate.desiredQuantity ?? candidate.voteCount
      }));

      return {
        kpis: {
          ...kpiRow,
          activeCampaignName: activeCampaign?.name ?? null,
          activeCampaignId: activeCampaign?.id ?? null
        },
        currentCampaignSummary,
        charts: {
          ordersByStatus,
          usersByRole,
          topVotedBurgers,
          topProductsByVotePercentage,
          campaignPerformance,
          activeCampaignBreakdown
        },
        recentAudit: listAudit(db, 10)
      };
    }
  };
}

