import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { AlertBanner, LoaderCard, Spinner, useToast } from '../../ui/Feedback.jsx';
import { formatCop } from './adminShared.jsx';

const ORDER_STATUS_META = {
  PENDING: { label: 'Pendientes', color: '#facc15' },
  CONFIRMED: { label: 'Confirmados', color: '#38bdf8' },
  PREPARING: { label: 'En preparación', color: '#ff5e1f' },
  READY: { label: 'Listos', color: '#22c55e' },
  DELIVERED: { label: 'Entregados', color: '#a1a1aa' },
  CANCELLED: { label: 'Cancelados', color: '#f87171' }
};

const ENTITY_META = {
  BURGER: { label: 'Catálogo de Productos', route: '/admin/productos', color: '#ffb547' },
  CAMPAIGN: { label: 'Ciclos de Votación', route: '/admin/votaciones', color: '#38bdf8' },
  ORDER: { label: 'Pedidos y Cocina', route: '/cocina', color: '#22c55e' },
  USER: { label: 'Usuarios y Clientes', route: '/admin/usuarios', color: '#c084fc' }
};

export default function AdminDashboard({ stats: initialStats = null, onNavigate }) {
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(!initialStats);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const routerNavigate = useNavigate();
  const navigateTo = onNavigate || routerNavigate;
  const { notify } = useToast();

  const loadStats = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const data = await api('/admin/stats');
        setStats(data);
        setError('');
        if (isRefresh) {
          notify({
            type: 'info',
            title: 'Analítica actualizada',
            message: 'Métricas, KPIs y gráficas sincronizadas.'
          });
        }
      } catch (err) {
        setError(err.message);
        notify({ type: 'error', title: 'Error al consultar métricas', message: err.message });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [notify]
  );

  useEffect(() => {
    if (!initialStats) {
      loadStats(false);
    }
  }, [initialStats, loadStats]);

  const totals = stats?.totals || {
    users: 0,
    staff: 0,
    burgers: 0,
    campaigns: 0,
    votes: 0,
    desiredBurgers: 0,
    orders: 0,
    totalOrders: 0,
    revenueCop: 0
  };

  const kpiCards = [
    {
      label: 'Clientes del club',
      value: totals.users,
      sub: `${totals.staff || 2} integrantes en equipo interno`,
      tone: 'kpi-orange',
      route: '/admin/clientes'
    },
    {
      label: 'Productos activos',
      value: totals.burgers,
      sub: `${totals.burgers} recetas activas en catálogo`,
      tone: 'kpi-amber',
      route: '/admin/productos'
    },
    {
      label: 'Ciclos de votación',
      value: totals.campaigns,
      sub: 'Convocatorias mensuales registradas',
      tone: 'kpi-blue',
      route: '/admin/votaciones'
    },
    {
      label: 'Votos emitidos',
      value: totals.votes,
      sub: `${totals.desiredBurgers ?? totals.votes} hamburguesas deseadas`,
      tone: 'kpi-green',
      route: '/admin/votaciones'
    },
    {
      label: 'Pedidos activos',
      value: totals.orders,
      sub: `Ingresos: ${formatCop(totals.revenueCop || 0)}`,
      tone: 'kpi-rose',
      route: '/cocina'
    }
  ];

  const topBurgers = useMemo(() => {
    const raw = stats?.charts?.topBurgers || [];
    return raw.slice(0, 6);
  }, [stats]);

  const maxBurgerMetric = useMemo(() => {
    return Math.max(
      1,
      ...topBurgers.map(b =>
        Math.max(b.voteCount || 0, b.desiredQuantity || 0, b.orderedQuantity || 0)
      )
    );
  }, [topBurgers]);

  const orderBreakdown = useMemo(() => {
    const map = new Map();
    for (const row of stats?.charts?.ordersByStatus || []) {
      map.set(row.status, {
        count: Number(row.count || 0),
        totalCop: Number(row.totalCop || 0)
      });
    }
    const items = Object.entries(ORDER_STATUS_META).map(([status, meta]) => {
      const item = map.get(status) || { count: 0, totalCop: 0 };
      return {
        status,
        label: meta.label,
        color: meta.color,
        count: item.count,
        totalCop: item.totalCop
      };
    });
    const total = items.reduce((acc, item) => acc + item.count, 0);
    return { items, total };
  }, [stats]);

  const donutSegments = useMemo(() => {
    const radius = 44;
    const circumference = 2 * Math.PI * radius;
    const total = Math.max(1, orderBreakdown.total);
    let offset = 0;

    return orderBreakdown.items
      .filter(item => item.count > 0)
      .map(item => {
        const fraction = item.count / total;
        const length = fraction * circumference;
        const seg = {
          ...item,
          pct: Math.round(fraction * 100),
          dashArray: `${length} ${circumference - length}`,
          dashOffset: -offset
        };
        offset += length;
        return seg;
      });
  }, [orderBreakdown]);

  const campaignsChart = useMemo(() => {
    const list = stats?.campaigns || [];
    const maxDesired = Math.max(
      1,
      ...list.map(c =>
        c.candidates.reduce((sum, item) => sum + (item.desiredQuantity ?? item.voteCount ?? 0), 0)
      )
    );
    return list.slice(0, 5).map(c => {
      const votes = c.candidates.reduce((sum, item) => sum + item.voteCount, 0);
      const desired = c.candidates.reduce(
        (sum, item) => sum + (item.desiredQuantity ?? item.voteCount ?? 0),
        0
      );
      const leader = c.candidates.toSorted(
        (a, b) => b.voteCount - a.voteCount || (b.desiredQuantity || 0) - (a.desiredQuantity || 0)
      )[0];
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        votes,
        desired,
        pctWidth: Math.round((desired / maxDesired) * 100),
        leaderName: leader?.name || 'Sin candidatas'
      };
    });
  }, [stats]);

  const auditDistribution = useMemo(() => {
    const rows = stats?.charts?.auditByEntity || [];
    const total = Math.max(1, rows.reduce((sum, r) => sum + Number(r.count || 0), 0));
    return rows.map(row => {
      const meta = ENTITY_META[row.entityType] || {
        label: row.entityType,
        route: '/admin/trazabilidad',
        color: '#ff5e1f'
      };
      const count = Number(row.count || 0);
      return {
        entityType: row.entityType,
        label: meta.label,
        route: meta.route,
        color: meta.color,
        count,
        pct: Math.round((count / total) * 100)
      };
    });
  }, [stats]);

  if (loading && !stats) {
    return (
      <LoaderCard
        title="Cargando panel ejecutivo…"
        subtitle="Consultando indicadores clave y series de gráficas del club."
      />
    );
  }

  return (
    <div className="dashboard-module">
      <AlertBanner
        type="error"
        title="Error al cargar analítica"
        message={error}
        onClose={() => setError('')}
      />

      <div className="flex justify-end mb-4">
        <button
          type="button"
          className="button ghost small"
          disabled={refreshing}
          onClick={() => loadStats(true)}
        >
          {refreshing ? (
            <>
              <Spinner size="sm" label="Sincronizando analítica…" />
              <span>Sincronizando…</span>
            </>
          ) : (
            '↻ Actualizar analítica'
          )}
        </button>
      </div>

      <section className="stats-grid" aria-label="Indicadores clave del sistema">
        {kpiCards.map(card => (
          <article
            key={card.label}
            className={`kpi-card ${card.tone} kpi-clickable`}
            onClick={() => navigateTo(card.route)}
          >
            <small>{card.label}</small>
            <strong>{card.value}</strong>
            <span className="kpi-sub">{card.sub}</span>
          </article>
        ))}
      </section>

      <section className="dashboard-charts-grid" aria-label="Gráficas analíticas del aplicativo">
        {/* GRÁFICA 1: Votos, Hamburguesas Deseadas y Pedidos por Producto */}
        <article className="chart-card chart-card-wide">
          <header className="chart-card-head">
            <div>
              <span className="eyebrow">DEMANDA Y PREFERENCIA DE PRODUCTOS</span>
              <h3>Votos vs. Hamburguesas deseadas vs. Unidades pedidas</h3>
              <p>
                Comparativa en tiempo real del respaldo en urna, intención de compra declarada al votar y ventas reales.
              </p>
            </div>
            <div className="chart-legend">
              <span>
                <i className="legend-dot dot-orange" /> Votos únicos
              </span>
              <span>
                <i className="legend-dot dot-amber" /> Uds. deseadas (voto)
              </span>
              <span>
                <i className="legend-dot dot-green" /> Uds. pedidas (órdenes)
              </span>
            </div>
          </header>

          <div className="burger-demand-chart">
            {topBurgers.map(burger => {
              const votePct = Math.round(((burger.voteCount || 0) / maxBurgerMetric) * 100);
              const desiredPct = Math.round(((burger.desiredQuantity || 0) / maxBurgerMetric) * 100);
              const orderedPct = Math.round(((burger.orderedQuantity || 0) / maxBurgerMetric) * 100);
              return (
                <div className="demand-row" key={burger.id}>
                  <div className="demand-product">
                    <img src={burger.imageUrl || '/assets/hero-burger.jpeg'} alt="" />
                    <div>
                      <strong>{burger.name}</strong>
                      <small>{formatCop(burger.priceCop)}</small>
                    </div>
                  </div>
                  <div className="demand-bars">
                    <div className="demand-bar-line">
                      <span className="demand-bar-label">Votos</span>
                      <div className="demand-bar-track">
                        <div
                          className="demand-bar-fill fill-orange"
                          style={{ inlineSize: `${Math.max(votePct, burger.voteCount > 0 ? 6 : 0)}%` }}
                        />
                      </div>
                      <b className="demand-bar-val">{burger.voteCount || 0}</b>
                    </div>

                    <div className="demand-bar-line">
                      <span className="demand-bar-label">Deseadas</span>
                      <div className="demand-bar-track">
                        <div
                          className="demand-bar-fill fill-amber"
                          style={{
                            inlineSize: `${Math.max(desiredPct, burger.desiredQuantity > 0 ? 6 : 0)}%`
                          }}
                        />
                      </div>
                      <b className="demand-bar-val">{burger.desiredQuantity || 0} uds.</b>
                    </div>

                    <div className="demand-bar-line">
                      <span className="demand-bar-label">Pedidas</span>
                      <div className="demand-bar-track">
                        <div
                          className="demand-bar-fill fill-green"
                          style={{
                            inlineSize: `${Math.max(orderedPct, burger.orderedQuantity > 0 ? 6 : 0)}%`
                          }}
                        />
                      </div>
                      <b className="demand-bar-val">{burger.orderedQuantity || 0} uds.</b>
                    </div>
                  </div>
                </div>
              );
            })}
            {!topBurgers.length && (
              <p className="empty-table-cell">Aún no hay datos de productos para graficar.</p>
            )}
          </div>
        </article>

        {/* GRÁFICA 2: Estado de Pedidos e Ingresos (Donut SVG) */}
        <article className="chart-card">
          <header className="chart-card-head">
            <div>
              <span className="eyebrow">OPERACIÓN DE COCINA</span>
              <h3>Distribución de comandas</h3>
              <p>Estado actual del flujo de órdenes y facturación acumulada.</p>
            </div>
          </header>

          <div className="donut-chart-layout">
            <div className="donut-svg-wrap">
              <svg viewBox="0 0 120 120" className="donut-svg" role="img" aria-label="Gráfico circular de pedidos por estado">
                <circle
                  cx="60"
                  cy="60"
                  r="44"
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="14"
                />
                {donutSegments.map(seg => (
                  <circle
                    key={seg.status}
                    cx="60"
                    cy="60"
                    r="44"
                    fill="none"
                    stroke={seg.color}
                    strokeWidth="14"
                    strokeDasharray={seg.dashArray}
                    strokeDashoffset={seg.dashOffset}
                    transform="rotate(-90 60 60)"
                  />
                ))}
              </svg>
              <div className="donut-center">
                <strong>{orderBreakdown.total}</strong>
                <small>órdenes</small>
              </div>
            </div>

            <ul className="donut-breakdown-list">
              {orderBreakdown.items.map(item => (
                <li key={item.status}>
                  <span className="donut-status-name">
                    <i style={{ backgroundColor: item.color }} />
                    {item.label}
                  </span>
                  <span className="donut-status-metrics">
                    <b>{item.count}</b>
                    {item.totalCop > 0 && <small>{formatCop(item.totalCop)}</small>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </article>

        {/* GRÁFICA 3: Participación y Demanda por Campaña */}
        <article className="chart-card">
          <header className="chart-card-head">
            <div>
              <span className="eyebrow">HISTÓRICO DE CONVOCATORIAS</span>
              <h3>Demanda proyectada por ciclo</h3>
              <p>Votos y volumen de hamburguesas solicitadas en cada campaña.</p>
            </div>
            <button
              type="button"
              className="button ghost small"
              onClick={() => navigateTo('/admin/votaciones')}
            >
              Ir a votaciones →
            </button>
          </header>

          <div className="campaign-chart-list">
            {campaignsChart.map(c => (
              <div className="campaign-chart-row" key={c.id}>
                <div className="campaign-chart-top">
                  <div>
                    <strong>{c.name}</strong>
                    <small>Líder: {c.leaderName}</small>
                  </div>
                  <div className="campaign-chart-badges">
                    <span className="meta-chip">{c.votes} votos</span>
                    <span className="meta-chip">{c.desired} uds. deseadas</span>
                    <span className={`status ${c.status === 'ACTIVE' ? 'on' : 'off'}`}>{c.status}</span>
                  </div>
                </div>
                <div className="demand-bar-track">
                  <div
                    className="demand-bar-fill fill-orange"
                    style={{ inlineSize: `${Math.max(c.pctWidth, c.desired > 0 ? 8 : 0)}%` }}
                  />
                </div>
              </div>
            ))}
            {!campaignsChart.length && (
              <p className="empty-table-cell">Aún no hay campañas registradas para graficar.</p>
            )}
          </div>
        </article>

        {/* GRÁFICA 4: Eventos de Trazabilidad por Entidad + Accesos Rápidos */}
        <article className="chart-card">
          <header className="chart-card-head">
            <div>
              <span className="eyebrow">TRAZABILIDAD Y SEGURIDAD</span>
              <h3>Actividad auditada por módulo</h3>
              <p>Proporción de eventos registrados según el módulo afectado.</p>
            </div>
            <button
              type="button"
              className="button ghost small"
              onClick={() => navigateTo('/admin/trazabilidad')}
            >
              Ver DataTable →
            </button>
          </header>

          <div className="audit-chart-list">
            {auditDistribution.length > 0 ? (
              auditDistribution.map(item => (
                <div
                  key={item.entityType}
                  className="audit-chart-item"
                  onClick={() => navigateTo(item.route)}
                >
                  <div className="audit-chart-head">
                    <span>
                      <i className="legend-dot" style={{ backgroundColor: item.color }} />
                      <strong>{item.label}</strong>
                    </span>
                    <b className="font-mono text-xs text-brand-amber">
                      {item.count} eventos ({item.pct}%)
                    </b>
                  </div>
                  <div className="demand-bar-track">
                    <div
                      className="demand-bar-fill"
                      style={{
                        inlineSize: `${Math.max(item.pct, 6)}%`,
                        background: item.color
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-table-cell">Aún no se han registrado eventos de auditoría.</p>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
