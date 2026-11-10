import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { AlertBanner, LoaderCard, Spinner, useToast } from '../../ui/Feedback.jsx';
import { formatCop } from './adminShared.jsx';

const TOP5_DONUT_COLORS = ['#ff5e1f', '#ffb547', '#38bdf8', '#22c55e', '#c084fc'];

const ORDER_STATUS_META = {
  PENDING: { label: 'Pendientes', color: '#facc15' },
  CONFIRMED: { label: 'Confirmados', color: '#38bdf8' },
  PREPARING: { label: 'En preparación', color: '#ff5e1f' },
  READY: { label: 'Listos', color: '#22c55e' },
  DELIVERED: { label: 'Entregados', color: '#a1a1aa' },
  CANCELLED: { label: 'Cancelados', color: '#f87171' }
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
    totalUsers: 0,
    burgers: 0,
    totalBurgers: 0,
    campaigns: 0,
    votes: 0,
    desiredBurgers: 0,
    orders: 0,
    totalOrders: 0,
    revenueCop: 0
  };

  // Campaña actual (prioriza la activa, o toma la más reciente)
  const currentCampaign = useMemo(() => {
    const list = stats?.campaigns || [];
    if (!list.length) return null;

    const raw = list.find(c => c.status === 'ACTIVE') || list[0];
    const candidates = raw.candidates || [];
    const totalVotes = candidates.reduce((sum, item) => sum + Number(item.voteCount || 0), 0);
    const totalDesired = candidates.reduce(
      (sum, item) => sum + Number(item.desiredQuantity ?? item.voteCount ?? 0),
      0
    );
    const maxVotes = Math.max(1, ...candidates.map(item => Number(item.voteCount || 0)));

    const sortedCandidates = [...candidates]
      .sort(
        (a, b) =>
          Number(b.voteCount || 0) - Number(a.voteCount || 0) ||
          Number(b.desiredQuantity || 0) - Number(a.desiredQuantity || 0)
      )
      .map((item, idx) => {
        const voteCount = Number(item.voteCount || 0);
        const desiredQuantity = Number(item.desiredQuantity ?? item.voteCount ?? 0);
        const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
        const barWidth = totalVotes > 0 ? Math.round((voteCount / maxVotes) * 100) : 0;
        return {
          ...item,
          rank: idx + 1,
          voteCount,
          desiredQuantity,
          pct,
          barWidth
        };
      });

    const winnerOrLeader =
      (raw.winnerBurgerId && sortedCandidates.find(c => c.id === raw.winnerBurgerId)) ||
      sortedCandidates[0] ||
      null;

    return {
      ...raw,
      totalVotes,
      totalDesired,
      candidates: sortedCandidates,
      leader: winnerOrLeader
    };
  }, [stats]);

  const totalRegisteredUsers =
    totals.totalUsers || Number(totals.users || 0) + Number(totals.staff || 0);
  const totalCatalogProducts = totals.totalBurgers || totals.burgers || 0;

  const kpiCards = [
    {
      label: 'Clientes registrados',
      value: totals.users ?? 0,
      sub: 'Miembros activos en el club',
      tone: 'kpi-orange',
      route: '/admin/clientes'
    },
    {
      label: 'Usuarios del sistema',
      value: totalRegisteredUsers,
      sub: `${totals.staff || 0} equipo interno · ${totals.users || 0} clientes`,
      tone: 'kpi-purple',
      route: '/admin/usuarios'
    },
    {
      label: 'Productos',
      value: totalCatalogProducts,
      sub: `${totals.burgers || 0} recetas activas en catálogo`,
      tone: 'kpi-amber',
      route: '/admin/productos'
    },
    {
      label: 'Votaciones registradas',
      value: totals.votes ?? 0,
      sub: `${totals.desiredBurgers ?? totals.votes ?? 0} uds. deseadas · ${totals.campaigns || 0} ciclos`,
      tone: 'kpi-green',
      route: '/admin/votaciones'
    }
  ];

  // Top 5 productos con más % de votaciones para la Gráfica de Dona
  const top5VotesDonut = useMemo(() => {
    const raw = stats?.charts?.topBurgers || [];
    const top5 = [...raw]
      .sort(
        (a, b) =>
          Number(b.voteCount || 0) - Number(a.voteCount || 0) ||
          Number(b.desiredQuantity || 0) - Number(a.desiredQuantity || 0)
      )
      .slice(0, 5);

    const top5TotalVotes = top5.reduce((sum, b) => sum + Number(b.voteCount || 0), 0);
    const radius = 44;
    const circumference = 2 * Math.PI * radius;
    const safeTotal = Math.max(1, top5TotalVotes);
    let offset = 0;

    const items = top5.map((burger, idx) => {
      const voteCount = Number(burger.voteCount || 0);
      const desiredQuantity = Number(burger.desiredQuantity || 0);
      const fraction = top5TotalVotes > 0 ? voteCount / safeTotal : 0;
      const pct = top5TotalVotes > 0 ? Math.round(fraction * 1000) / 10 : 0;
      const length = fraction * circumference;
      const color = TOP5_DONUT_COLORS[idx % TOP5_DONUT_COLORS.length];

      const item = {
        id: burger.id,
        rank: idx + 1,
        name: burger.name,
        imageUrl: burger.imageUrl || '/assets/hero-burger.jpeg',
        priceCop: burger.priceCop,
        voteCount,
        desiredQuantity,
        pct,
        color,
        dashArray: `${length} ${Math.max(0, circumference - length)}`,
        dashOffset: -offset
      };
      offset += length;
      return item;
    });

    return {
      items,
      totalVotes: top5TotalVotes,
      segments: items.filter(item => item.voteCount > 0)
    };
  }, [stats]);

  const topBurgers = useMemo(() => {
    const raw = stats?.charts?.topBurgers || [];
    return raw.slice(0, 5);
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

      <div className="dashboard-top-bar">
        <div>
          <span className="eyebrow">RESUMEN GENERAL DEL CLUB</span>
          <h2 className="dashboard-heading">Estadísticas y rendimiento en urna</h2>
        </div>
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

      {/* 4 Tarjetas Principales Balanceadas: Clientes, Usuarios, Productos, Votaciones */}
      <section className="stats-grid" aria-label="Indicadores clave del sistema">
        {kpiCards.map(card => (
          <button
            key={card.label}
            type="button"
            className={`kpi-card kpi-card-button ${card.tone}`}
            onClick={() => navigateTo(card.route)}
          >
            <small>{card.label}</small>
            <strong>{card.value}</strong>
            <span className="kpi-sub">{card.sub}</span>
          </button>
        ))}
      </section>

      {/* Grid Responsivo de Gráficas (2x2 en escritorio, 1 columna en tablet/móvil) */}
      <section className="dashboard-charts-grid" aria-label="Gráficas de votaciones, productos y operación">
        {/* TARJETA 1: Campaña Actual — La más votada y cuántas votaciones lleva */}
        <article className="chart-card chart-card-wide">
          <header className="chart-card-head">
            <div>
              <span className="eyebrow">
                {currentCampaign?.status === 'ACTIVE'
                  ? 'CAMPAÑA ACTUAL EN CURSO'
                  : 'CICLO DE VOTACIÓN RECIENTE'}
              </span>
              <h3>
                {currentCampaign ? currentCampaign.name : 'Sin ciclo de votación registrado'}
              </h3>
              <p>
                {currentCampaign
                  ? `Vigencia: ${new Date(currentCampaign.startsAt).toLocaleDateString('es-CO')} al ${new Date(currentCampaign.endsAt).toLocaleDateString('es-CO')}`
                  : 'Crea y publica una campaña para visualizar el escrutinio en vivo.'}
              </p>
            </div>
            <div className="chart-card-actions">
              {currentCampaign && (
                <span className={`status ${currentCampaign.status === 'ACTIVE' ? 'on' : 'off'}`}>
                  {currentCampaign.status}
                </span>
              )}
              <button
                type="button"
                className="button ghost small"
                onClick={() => navigateTo('/admin/votaciones')}
              >
                Ver ciclos →
              </button>
            </div>
          </header>

          {currentCampaign ? (
            <>
              {/* Cajas de conteo de la campaña actual */}
              <div className="current-campaign-kpis">
                <div className="current-campaign-kpi-box">
                  <small>Votaciones que lleva</small>
                  <strong>{currentCampaign.totalVotes}</strong>
                  <span>votos en esta campaña</span>
                </div>
                <div className="current-campaign-kpi-box">
                  <small>Unidades deseadas</small>
                  <strong>{currentCampaign.totalDesired} uds.</strong>
                  <span>intención de compra</span>
                </div>
                <div className="current-campaign-kpi-box">
                  <small>Candidatas</small>
                  <strong>{currentCampaign.candidates.length}</strong>
                  <span>productos compitiendo</span>
                </div>
              </div>

              {/* Hamburguesa más votada de la campaña actual */}
              {currentCampaign.leader && (
                <div className="current-campaign-leader">
                  <img
                    src={currentCampaign.leader.imageUrl || '/assets/hero-burger.jpeg'}
                    alt={currentCampaign.leader.name}
                    className="current-campaign-leader-img"
                  />
                  <div className="current-campaign-leader-body">
                    <span className="current-campaign-leader-tag">
                      {currentCampaign.winnerBurgerId
                        ? '👑 HAMBURGUESA GANADORA PROCLAMADA'
                        : '🔥 LA MÁS VOTADA DE LA CAMPAÑA ACTUAL'}
                    </span>
                    <h4>{currentCampaign.leader.name}</h4>
                    <div className="current-campaign-leader-metrics">
                      <span className="leader-metric-pill highlight">
                        {currentCampaign.leader.voteCount} votaciones ({currentCampaign.leader.pct}%)
                      </span>
                      <span className="leader-metric-pill">
                        {currentCampaign.leader.desiredQuantity} uds. deseadas
                      </span>
                      <span className="leader-metric-pill">
                        {formatCop(currentCampaign.leader.priceCop)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Barras de votación por candidata en la campaña actual */}
              <div className="burger-demand-chart">
                {currentCampaign.candidates.map(cand => (
                  <div className="burger-demand-row" key={cand.id}>
                    <div className="burger-demand-meta">
                      <span className="burger-demand-rank">#{cand.rank}</span>
                      <img src={cand.imageUrl || '/assets/hero-burger.jpeg'} alt="" />
                      <div>
                        <strong>
                          {cand.name} {cand.rank === 1 && currentCampaign.totalVotes > 0 ? '👑' : ''}
                        </strong>
                        <small>{formatCop(cand.priceCop)}</small>
                      </div>
                      <span className="donut-pct-badge">{cand.pct}%</span>
                    </div>
                    <div className="metric-bar-line">
                      <span className="metric-bar-label">{cand.voteCount} votos</span>
                      <div className="metric-bar-track">
                        <div
                          className={`bar-fill ${cand.rank === 1 ? 'tone-orange' : 'tone-amber'}`}
                          style={{
                            inlineSize: `${Math.max(cand.barWidth, cand.voteCount > 0 ? 6 : 0)}%`
                          }}
                        />
                      </div>
                      <b className="metric-bar-value">{cand.desiredQuantity} uds.</b>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="empty-table-cell">No hay campañas disponibles para mostrar.</p>
          )}
        </article>

        {/* TARJETA 2: Gráfica de Dona — Los 5 Productos en temas de % que más reciben votaciones */}
        <article className="chart-card chart-card-narrow">
          <header className="chart-card-head">
            <div>
              <span className="eyebrow">TOP 5 PRODUCTOS EN URNA (%)</span>
              <h3>Top 5 productos con más % de votaciones</h3>
              <p>Distribución porcentual de las 5 hamburguesas más votadas por los clientes.</p>
            </div>
          </header>

          <div className="donut-chart-layout">
            <div className="donut-svg-wrap">
              <svg
                viewBox="0 0 120 120"
                className="donut-svg"
                role="img"
                aria-label="Gráfica de dona con el porcentaje de votaciones de los 5 productos más votados"
              >
                <circle
                  cx="60"
                  cy="60"
                  r="44"
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="14"
                />
                {top5VotesDonut.segments.map(seg => (
                  <circle
                    key={seg.id}
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
                <strong>{top5VotesDonut.totalVotes}</strong>
                <small>votos top 5</small>
              </div>
            </div>

            <ul className="donut-breakdown-list">
              {top5VotesDonut.items.map(item => (
                <li key={item.id}>
                  <span className="donut-status-name">
                    <i style={{ backgroundColor: item.color }} />
                    <img src={item.imageUrl} alt="" className="donut-product-thumb" />
                    <strong>
                      #{item.rank} {item.name}
                    </strong>
                  </span>
                  <span className="donut-status-metrics">
                    <span className="donut-pct-badge">{item.pct}%</span>
                    <small>{item.voteCount}v</small>
                  </span>
                </li>
              ))}
              {!top5VotesDonut.items.length && (
                <li>
                  <span className="text-xs text-muted">Sin productos registrados.</span>
                </li>
              )}
            </ul>
          </div>

          {/* Tabla alternativa accesible para lectores de pantalla */}
          <table className="visually-hidden">
            <caption>Top 5 productos con mayor porcentaje de votaciones</caption>
            <thead>
              <tr>
                <th scope="col">Posición</th>
                <th scope="col">Producto</th>
                <th scope="col">Porcentaje de votación</th>
                <th scope="col">Votos</th>
                <th scope="col">Unidades deseadas</th>
              </tr>
            </thead>
            <tbody>
              {top5VotesDonut.items.map(item => (
                <tr key={item.id}>
                  <td>#{item.rank}</td>
                  <th scope="row">{item.name}</th>
                  <td>{item.pct}%</td>
                  <td>{item.voteCount}</td>
                  <td>{item.desiredQuantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        {/* TARJETA 3: Votos, Hamburguesas Deseadas y Pedidos por Producto */}
        <article className="chart-card chart-card-wide">
          <header className="chart-card-head">
            <div>
              <span className="eyebrow">DEMANDA Y PREFERENCIA DE PRODUCTOS</span>
              <h3>Votos vs. Hamburguesas deseadas vs. Unidades pedidas</h3>
              <p>
                Comparativa del respaldo en urna, intención de compra declarada al votar y ventas reales.
              </p>
            </div>
            <div className="chart-legend">
              <span>
                <i className="legend-dot dot-orange" /> Votos únicos
              </span>
              <span>
                <i className="legend-dot dot-amber" /> Uds. deseadas
              </span>
              <span>
                <i className="legend-dot dot-green" /> Uds. pedidas
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

        {/* TARJETA 4: Estado de Pedidos e Ingresos (Donut SVG) */}
        <article className="chart-card chart-card-narrow">
          <header className="chart-card-head">
            <div>
              <span className="eyebrow">OPERACIÓN DE COCINA</span>
              <h3>Distribución de comandas</h3>
              <p>Estado actual del flujo de órdenes ({totals.orders || 0} activas) y facturación acumulada.</p>
            </div>
            <button
              type="button"
              className="button ghost small"
              onClick={() => navigateTo('/cocina')}
            >
              Ir a cocina →
            </button>
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
      </section>
    </div>
  );
}
