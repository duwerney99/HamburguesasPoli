/**
 * ENTIDAD DE DOMINIO: Estadísticas de Dashboard (Módulo Stats)
 */
export class DashboardStatsEntity {
  constructor({ kpis, currentCampaignSummary, charts, recentAudit = [] }) {
    this.kpis = kpis;
    this.currentCampaignSummary = currentCampaignSummary;
    this.charts = charts;
    this.recentAudit = recentAudit;
  }

  toJSON() {
    return {
      kpis: this.kpis,
      currentCampaignSummary: this.currentCampaignSummary,
      charts: this.charts,
      recentAudit: this.recentAudit
    };
  }
}

