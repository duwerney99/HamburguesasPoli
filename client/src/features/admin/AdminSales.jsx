import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { AlertBanner, LoaderCard, Spinner, useToast } from '../../ui/Feedback.jsx';
import { DataTableFooter, formatCop, PAGE_SIZE_OPTIONS } from './adminShared.jsx';

const PAYMENT_LABELS = {
  PAID: '✓ Pagado',
  UNPAID: '⏳ Pendiente pago',
  CANCELLED: '✕ Cancelado'
};

const ORDER_STATUS_LABELS = {
  PENDING: 'Pendiente pago',
  CONFIRMED: 'Confirmado (En cola Chef)',
  PREPARING: 'Preparando en parrilla',
  READY: 'Listo para entregar',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado'
};

const KITCHEN_STATUS_OPTIONS = [
  { value: 'CONFIRMED', label: 'Confirmado (En cola Chef)' },
  { value: 'PREPARING', label: 'Preparando en parrilla' },
  { value: 'READY', label: 'Listo para entregar' },
  { value: 'DELIVERED', label: 'Entregado al cliente' },
  { value: 'CANCELLED', label: 'Cancelado' }
];

export function PaymentStatusPill({ status }) {
  const safe = status || 'UNPAID';
  const cls =
    safe === 'PAID'
      ? 'payment-pill payment-pill-paid'
      : safe === 'CANCELLED'
        ? 'payment-pill payment-pill-cancelled'
        : 'payment-pill payment-pill-unpaid';
  return <span className={cls}>{PAYMENT_LABELS[safe] || PAYMENT_LABELS.UNPAID}</span>;
}

export function OrderStatusPill({ status }) {
  const safe = status || 'PENDING';
  return (
    <span className={`status order-${safe.toLowerCase()}`}>
      {ORDER_STATUS_LABELS[safe] || safe}
    </span>
  );
}

export function AdminSales() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [activeTab, setActiveTab] = useState('campaign'); // 'campaign' | 'all'
  const [busyKey, setBusyKey] = useState('');
  const navigate = useNavigate();
  const { notify } = useToast();

  // Estados DataTable: Pedidos por la Campaña Actual
  const [campSearch, setCampSearch] = useState('');
  const [campPaymentFilter, setCampPaymentFilter] = useState('ALL');
  const [campBurgerFilter, setCampBurgerFilter] = useState('ALL');
  const [campSortBy, setCampSortBy] = useState('createdAt');
  const [campSortDir, setCampSortDir] = useState('desc');
  const [campPage, setCampPage] = useState(1);
  const [campPageSize, setCampPageSize] = useState(10);

  // Estados DataTable: Todas las Ventas Realizadas
  const [salesSearch, setSalesSearch] = useState('');
  const [salesPaymentFilter, setSalesPaymentFilter] = useState('ALL');
  const [salesStatusFilter, setSalesStatusFilter] = useState('ALL');
  const [salesSortBy, setSalesSortBy] = useState('id');
  const [salesSortDir, setSalesSortDir] = useState('desc');
  const [salesPage, setSalesPage] = useState(1);
  const [salesPageSize, setSalesPageSize] = useState(10);

  const loadSales = useCallback(
    async (campaignIdOverride = selectedCampaignId, isManual = false) => {
      if (isManual) setRefreshing(true);
      else setLoading(true);
      try {
        const query = campaignIdOverride
          ? `?campaignId=${encodeURIComponent(campaignIdOverride)}`
          : '';
        const res = await api(`/admin/sales${query}`);
        setData(res);
        setError('');
        if (!campaignIdOverride && res.currentCampaign?.id) {
          setSelectedCampaignId(String(res.currentCampaign.id));
        }
        if (isManual) {
          notify({
            type: 'info',
            title: 'Ventas sincronizadas',
            message: 'Se actualizaron las ventas y los pedidos de campaña.'
          });
        }
      } catch (err) {
        setError(err.message);
        notify({
          type: 'error',
          title: 'Error al consultar ventas',
          message: err.message
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedCampaignId, notify]
  );

  useEffect(() => {
    loadSales('', false);
  }, [loadSales]);

  async function handleCampaignChange(nextCampaignId) {
    setSelectedCampaignId(nextCampaignId);
    setCampPage(1);
    await loadSales(nextCampaignId, true);
  }

  async function updateCampaignVote(voteId, payload, successMessage) {
    const key = `vote-${voteId}`;
    setBusyKey(key);
    setError('');
    try {
      await api(`/admin/sales/campaign-votes/${voteId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      await loadSales(selectedCampaignId, false);
      notify({
        type: 'success',
        title: 'Pedido de campaña actualizado',
        message: successMessage
      });
    } catch (err) {
      setError(err.message);
      notify({
        type: 'error',
        title: 'No se pudo actualizar el pedido',
        message: err.message
      });
    } finally {
      setBusyKey('');
    }
  }

  async function updateSaleOrder(orderId, payload, successMessage) {
    const key = `order-${orderId}`;
    setBusyKey(key);
    setError('');
    try {
      await api(`/admin/sales/orders/${orderId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      await loadSales(selectedCampaignId, false);
      notify({
        type: 'success',
        title: 'Venta actualizada',
        message: successMessage
      });
    } catch (err) {
      setError(err.message);
      notify({
        type: 'error',
        title: 'No se pudo actualizar la venta',
        message: err.message
      });
    } finally {
      setBusyKey('');
    }
  }

  const summary = data?.summary || {};
  const currentCampaign = data?.currentCampaign || null;
  const campaigns = data?.campaigns || [];
  const campaignOrders = data?.campaignOrders || [];
  const allOrders = data?.orders || [];

  const campaignBurgers = useMemo(() => {
    const map = new Map();
    for (const item of campaignOrders) {
      if (!map.has(item.burgerId)) {
        map.set(item.burgerId, { id: item.burgerId, name: item.burgerName });
      }
    }
    return Array.from(map.values());
  }, [campaignOrders]);

  const filteredCampaignOrders = useMemo(() => {
    const q = campSearch.trim().toLowerCase();
    const filtered = campaignOrders.filter(item => {
      if (campPaymentFilter !== 'ALL' && item.paymentStatus !== campPaymentFilter) return false;
      if (campBurgerFilter !== 'ALL' && String(item.burgerId) !== String(campBurgerFilter)) return false;
      if (!q) return true;
      return (
        String(item.voteId).includes(q) ||
        String(item.orderId || '').includes(q) ||
        (item.customerName || '').toLowerCase().includes(q) ||
        (item.customerEmail || '').toLowerCase().includes(q) ||
        (item.burgerName || '').toLowerCase().includes(q)
      );
    });

    const dir = campSortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (campSortBy === 'customerName') {
        return (a.customerName || '').localeCompare(b.customerName || '', 'es') * dir;
      }
      if (campSortBy === 'burgerName') {
        return (a.burgerName || '').localeCompare(b.burgerName || '', 'es') * dir;
      }
      if (campSortBy === 'quantity') return (a.quantity - b.quantity) * dir;
      if (campSortBy === 'totalCop') return (a.totalCop - b.totalCop) * dir;
      if (campSortBy === 'paymentStatus') {
        return (a.paymentStatus || '').localeCompare(b.paymentStatus || '', 'es') * dir;
      }
      return (
        (String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || a.voteId - b.voteId) *
        dir
      );
    });
  }, [campaignOrders, campSearch, campPaymentFilter, campBurgerFilter, campSortBy, campSortDir]);

  const campTotalPages = Math.max(1, Math.ceil(filteredCampaignOrders.length / campPageSize));
  const safeCampPage = Math.min(campPage, campTotalPages);
  const paginatedCampaignOrders = useMemo(() => {
    const start = (safeCampPage - 1) * campPageSize;
    return filteredCampaignOrders.slice(start, start + campPageSize);
  }, [filteredCampaignOrders, safeCampPage, campPageSize]);

  const filteredSalesOrders = useMemo(() => {
    const q = salesSearch.trim().toLowerCase();
    const filtered = allOrders.filter(order => {
      if (salesPaymentFilter !== 'ALL' && order.paymentStatus !== salesPaymentFilter) return false;
      if (salesStatusFilter !== 'ALL' && order.status !== salesStatusFilter) return false;
      if (!q) return true;
      const itemsText = (order.items || []).map(i => i.burgerName).join(' ').toLowerCase();
      return (
        String(order.id).includes(q) ||
        (order.customerName || '').toLowerCase().includes(q) ||
        (order.customerEmail || '').toLowerCase().includes(q) ||
        (order.phone || '').toLowerCase().includes(q) ||
        (order.deliveryAddress || '').toLowerCase().includes(q) ||
        (order.campaignName || '').toLowerCase().includes(q) ||
        itemsText.includes(q)
      );
    });

    const dir = salesSortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (salesSortBy === 'customerName') {
        return (a.customerName || '').localeCompare(b.customerName || '', 'es') * dir;
      }
      if (salesSortBy === 'totalBurgers') return (a.totalBurgers - b.totalBurgers) * dir;
      if (salesSortBy === 'totalCop') return (a.totalCop - b.totalCop) * dir;
      if (salesSortBy === 'paymentStatus') {
        return (a.paymentStatus || '').localeCompare(b.paymentStatus || '', 'es') * dir;
      }
      if (salesSortBy === 'status') {
        return (a.status || '').localeCompare(b.status || '', 'es') * dir;
      }
      return (a.id - b.id) * dir;
    });
  }, [allOrders, salesSearch, salesPaymentFilter, salesStatusFilter, salesSortBy, salesSortDir]);

  const salesTotalPages = Math.max(1, Math.ceil(filteredSalesOrders.length / salesPageSize));
  const safeSalesPage = Math.min(salesPage, salesTotalPages);
  const paginatedSalesOrders = useMemo(() => {
    const start = (safeSalesPage - 1) * salesPageSize;
    return filteredSalesOrders.slice(start, start + salesPageSize);
  }, [filteredSalesOrders, safeSalesPage, salesPageSize]);

  function toggleCampSort(column) {
    setCampPage(1);
    if (campSortBy === column) {
      setCampSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setCampSortBy(column);
      setCampSortDir(column === 'customerName' || column === 'burgerName' ? 'asc' : 'desc');
    }
  }

  function toggleSalesSort(column) {
    setSalesPage(1);
    if (salesSortBy === column) {
      setSalesSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSalesSortBy(column);
      setSalesSortDir(column === 'customerName' ? 'asc' : 'desc');
    }
  }

  if (loading && !data) {
    return (
      <LoaderCard
        title="Cargando módulo de ventas y pedidos…"
        subtitle="Sincronizando pagos, pedidos de la campaña actual e historial comercial."
      />
    );
  }

  return (
    <div className="dashboard-module">
      <AlertBanner
        type="error"
        title="Error en el módulo de ventas"
        message={error}
        onClose={() => setError('')}
      />

      <div className="dashboard-top-bar">
        <div>
          <span className="eyebrow">CONTROL COMERCIAL · PAGOS Y DESPACHO A COCINA</span>
          <h2 className="dashboard-heading">Ventas y Pedidos por Campaña</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="button ghost small"
            onClick={() => navigate('/admin/cocina')}
          >
            🔥 Ir a Cocina del Chef
          </button>
          <button
            type="button"
            className="button ghost small"
            disabled={refreshing}
            onClick={() => loadSales(selectedCampaignId, true)}
          >
            {refreshing ? (
              <>
                <Spinner size="sm" label="Actualizando ventas…" />
                <span>Actualizando…</span>
              </>
            ) : (
              '↻ Actualizar ventas'
            )}
          </button>
        </div>
      </div>

      {/* 4 KPI Cards de Ventas */}
      <section className="stats-grid" aria-label="Indicadores de ventas y pagos">
        <div className="kpi-card kpi-green">
          <small>Ventas cobradas (Pagadas)</small>
          <strong>{formatCop(summary.totalRevenuePaidCop || 0)}</strong>
          <span className="kpi-sub">
            {summary.paidOrdersCount || 0} pedidos pagados · {summary.paidBurgersCount || 0} hamburguesas
          </span>
        </div>

        <button
          type="button"
          className="kpi-card kpi-card-button kpi-orange"
          onClick={() => setActiveTab('campaign')}
        >
          <small>Pedidos en campaña actual</small>
          <strong>{summary.campaignVotesTotal || 0}</strong>
          <span className="kpi-sub">
            {summary.campaignPaidCount || 0} pagados ({summary.campaignPaidBurgers || 0} uds.) ·{' '}
            {summary.campaignUnpaidCount || 0} pendientes
          </span>
        </button>

        <div className="kpi-card kpi-amber">
          <small>Pendientes por cobrar</small>
          <strong>{summary.unpaidOrdersCount || 0}</strong>
          <span className="kpi-sub">
            {formatCop(summary.unpaidTotalCop || 0)} pendientes (aún no pasan a cocina)
          </span>
        </div>

        <button
          type="button"
          className="kpi-card kpi-card-button kpi-purple"
          onClick={() => setActiveTab('all')}
        >
          <small>Total órdenes registradas</small>
          <strong>{summary.totalOrdersCount || 0}</strong>
          <span className="kpi-sub">
            {summary.paidOrdersCount || 0} en firme · {summary.cancelledCount || 0} cancelados
          </span>
        </button>
      </section>

      {/* Selector de pestaña: Pedidos por Campaña Actual vs Todas las Ventas */}
      <div className="sales-tabs-bar" role="tablist" aria-label="Vistas del módulo de ventas">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'campaign'}
          className={`sales-tab-btn ${activeTab === 'campaign' ? 'active' : ''}`}
          onClick={() => setActiveTab('campaign')}
        >
          <span>🗳️ Pedidos por la Campaña Actual</span>
          <span className="sales-tab-badge">{campaignOrders.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'all'}
          className={`sales-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          <span>🧾 Todas las Ventas Realizadas</span>
          <span className="sales-tab-badge">{allOrders.length}</span>
        </button>
      </div>

      {/* SECCIÓN 1: PEDIDOS POR LA CAMPAÑA ACTUAL */}
      {activeTab === 'campaign' && (
        <section className="admin-list datatable-section" aria-label="Pedidos por la campaña actual">
          <div className="sales-campaign-summary-bar">
            <div className="sales-campaign-summary-info">
              <div className="flex flex-wrap items-center gap-2">
                <span className="eyebrow">CICLO DE VOTACIÓN Y RESERVAS</span>
                {currentCampaign && (
                  <span className={`status ${currentCampaign.status === 'ACTIVE' ? 'on' : 'off'}`}>
                    {currentCampaign.status === 'ACTIVE' ? 'Campaña Activa' : currentCampaign.status}
                  </span>
                )}
              </div>
              <h3>{currentCampaign ? currentCampaign.name : 'Sin campaña seleccionada'}</h3>
              <p className="text-xs text-muted">
                Solo los pedidos marcados como <strong>✓ Pagado</strong> pasan al tablero de producción del Chef en Cocina.
              </p>
            </div>

            <div className="sales-campaign-summary-controls">
              <div className="datatable-pagesize">
                <label htmlFor="sales-campaign-select">Campaña:</label>
                <select
                  id="sales-campaign-select"
                  value={selectedCampaignId}
                  onChange={e => handleCampaignChange(e.target.value)}
                >
                  {campaigns.map(c => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name} ({c.status === 'ACTIVE' ? 'Activa' : c.status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sales-campaign-kpis">
                <div>
                  <small>Cobrado en campaña</small>
                  <strong className="text-brand-amber font-mono">
                    {formatCop(summary.campaignPaidRevenueCop || 0)}
                  </strong>
                </div>
                <div>
                  <small>Demanda proyectada</small>
                  <strong className="font-mono">
                    {formatCop(summary.campaignProjectedRevenueCop || 0)}
                  </strong>
                </div>
                <div>
                  <small>Hamburguesas pagadas</small>
                  <strong className="font-mono">
                    {summary.campaignPaidBurgers || 0} / {summary.campaignBurgersTotal || 0} uds.
                  </strong>
                </div>
              </div>
            </div>
          </div>

          <div className="section-heading admin-section-head">
            <div>
              <div className="datatable-title-row">
                <h2 id="sales-campaign-caption">Pedidos solicitados en la campaña</h2>
                {refreshing && <Spinner size="sm" label="Actualizando pedidos de campaña…" />}
              </div>
            </div>

            <div className="admin-toolbar">
              <div className="role-filter-group" role="group" aria-label="Filtrar por estado de pago">
                {[
                  ['ALL', `Todos (${campaignOrders.length})`],
                  ['PAID', `Pagados (${campaignOrders.filter(i => i.paymentStatus === 'PAID').length})`],
                  ['UNPAID', `Pendientes (${campaignOrders.filter(i => i.paymentStatus === 'UNPAID').length})`],
                  ['CANCELLED', `Cancelados (${campaignOrders.filter(i => i.paymentStatus === 'CANCELLED').length})`]
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`filter-chip ${campPaymentFilter === key ? 'active' : ''}`}
                    onClick={() => {
                      setCampPaymentFilter(key);
                      setCampPage(1);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="datatable-controls-right">
                {campaignBurgers.length > 0 && (
                  <div className="datatable-pagesize">
                    <label htmlFor="sales-camp-burger-filter">Receta</label>
                    <select
                      id="sales-camp-burger-filter"
                      value={campBurgerFilter}
                      onChange={e => {
                        setCampBurgerFilter(e.target.value);
                        setCampPage(1);
                      }}
                    >
                      <option value="ALL">Todas</option>
                      {campaignBurgers.map(b => (
                        <option key={b.id} value={String(b.id)}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="admin-search-field">
                  <label htmlFor="sales-camp-search" className="visually-hidden">
                    Buscar cliente o hamburguesa en la campaña
                  </label>
                  <input
                    id="sales-camp-search"
                    type="search"
                    placeholder="Buscar cliente, correo o burger…"
                    value={campSearch}
                    onChange={e => {
                      setCampSearch(e.target.value);
                      setCampPage(1);
                    }}
                  />
                </div>

                <div className="datatable-pagesize">
                  <label htmlFor="sales-camp-pagesize">Filas</label>
                  <select
                    id="sales-camp-pagesize"
                    value={campPageSize}
                    onChange={e => {
                      setCampPageSize(Number(e.target.value));
                      setCampPage(1);
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map(size => (
                      <option key={size} value={size}>
                        {size} / pág.
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div
            tabIndex={0}
            role="region"
            aria-labelledby="sales-campaign-caption"
            className="table-wrap responsive-table-region datatable-wrap"
          >
            <table className="admin-table datatable">
              <thead>
                <tr>
                  <th scope="col">
                    <button type="button" className="datatable-sort-btn" onClick={() => toggleCampSort('createdAt')}>
                      <span>Solicitud / Orden</span>
                      <span className="datatable-sort-icon" aria-hidden="true">
                        {campSortBy === 'createdAt' ? (campSortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className="datatable-sort-btn" onClick={() => toggleCampSort('customerName')}>
                      <span>Cliente</span>
                      <span className="datatable-sort-icon" aria-hidden="true">
                        {campSortBy === 'customerName' ? (campSortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className="datatable-sort-btn" onClick={() => toggleCampSort('burgerName')}>
                      <span>Hamburguesa Pedida</span>
                      <span className="datatable-sort-icon" aria-hidden="true">
                        {campSortBy === 'burgerName' ? (campSortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className="datatable-sort-btn" onClick={() => toggleCampSort('quantity')}>
                      <span>Cant. Pedida</span>
                      <span className="datatable-sort-icon" aria-hidden="true">
                        {campSortBy === 'quantity' ? (campSortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className="datatable-sort-btn" onClick={() => toggleCampSort('totalCop')}>
                      <span>Total COP</span>
                      <span className="datatable-sort-icon" aria-hidden="true">
                        {campSortBy === 'totalCop' ? (campSortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className="datatable-sort-btn" onClick={() => toggleCampSort('paymentStatus')}>
                      <span>Estado de Pago</span>
                      <span className="datatable-sort-icon" aria-hidden="true">
                        {campSortBy === 'paymentStatus' ? (campSortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  </th>
                  <th scope="col">Estado en Cocina</th>
                  <th scope="col" className="text-center" style={{ minWidth: '280px' }}>
                    Cambiar Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedCampaignOrders.map(item => {
                  const isBusy = busyKey === `vote-${item.voteId}`;
                  return (
                    <tr key={item.voteId}>
                      <th scope="row">
                        <div className="flex flex-col gap-0.5">
                          <strong className="font-mono text-xs text-white">Voto #{item.voteId}</strong>
                          {item.orderId ? (
                            <span className="font-mono text-xs text-brand-amber">
                              Comanda #{item.orderId}
                            </span>
                          ) : (
                            <span className="text-xs text-muted">Sin comanda aún</span>
                          )}
                        </div>
                      </th>
                      <td>
                        <div className="flex flex-col gap-0.5">
                          <strong className="text-white text-sm">{item.customerName}</strong>
                          <span className="text-xs text-muted">{item.customerEmail}</span>
                        </div>
                      </td>
                      <td>
                        <div className="voter-burger-cell">
                          <img
                            src={item.burgerImageUrl || '/assets/hero-burger.jpeg'}
                            alt={item.burgerName}
                            className="voter-burger-thumb"
                          />
                          <div className="flex flex-col gap-0.5">
                            <strong className="text-white text-sm">{item.burgerName}</strong>
                            <span className="text-xs text-muted font-mono">
                              {formatCop(item.unitPriceCop)} c/u
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="voter-qty-badge">
                          🍔 {item.quantity} {item.quantity === 1 ? 'unidad' : 'unidades'}
                        </span>
                      </td>
                      <td>
                        <strong className="font-mono text-brand-amber">
                          {formatCop(item.totalCop)}
                        </strong>
                      </td>
                      <td>
                        <PaymentStatusPill status={item.paymentStatus} />
                      </td>
                      <td>
                        {item.paymentStatus === 'PAID' ? (
                          <OrderStatusPill status={item.kitchenStatus} />
                        ) : item.paymentStatus === 'CANCELLED' ? (
                          <OrderStatusPill status="CANCELLED" />
                        ) : (
                          <span className="text-xs text-muted">Esperando pago</span>
                        )}
                      </td>
                      <td>
                        <div className="sales-actions-stack">
                          <div className="action-toolbar">
                            {item.paymentStatus !== 'PAID' && (
                              <button
                                type="button"
                                className="action-chip action-chip-success"
                                disabled={isBusy}
                                onClick={() =>
                                  updateCampaignVote(
                                    item.voteId,
                                    { paymentStatus: 'PAID', status: 'CONFIRMED' },
                                    `Pago confirmado para ${item.customerName} (${item.quantity} × ${item.burgerName}). Enviado a Cocina.`
                                  )
                                }
                              >
                                <span>✓ Pagado</span>
                              </button>
                            )}
                            {item.paymentStatus !== 'UNPAID' && (
                              <button
                                type="button"
                                className="action-chip action-chip-toggle"
                                disabled={isBusy}
                                onClick={() =>
                                  updateCampaignVote(
                                    item.voteId,
                                    { paymentStatus: 'UNPAID' },
                                    `Pedido de ${item.customerName} marcado como pendiente de pago.`
                                  )
                                }
                              >
                                <span>⏳ Pendiente</span>
                              </button>
                            )}
                            {item.paymentStatus !== 'CANCELLED' && (
                              <button
                                type="button"
                                className="action-chip action-chip-delete"
                                disabled={isBusy}
                                onClick={() =>
                                  updateCampaignVote(
                                    item.voteId,
                                    { paymentStatus: 'CANCELLED', status: 'CANCELLED' },
                                    `Pedido de ${item.customerName} cancelado.`
                                  )
                                }
                              >
                                <span>✕ Cancelar</span>
                              </button>
                            )}
                          </div>

                          {item.paymentStatus === 'PAID' && (
                            <select
                              className="sales-inline-select"
                              aria-label={`Estado en cocina para ${item.customerName}`}
                              disabled={isBusy}
                              value={item.kitchenStatus}
                              onChange={e =>
                                updateCampaignVote(
                                  item.voteId,
                                  { paymentStatus: 'PAID', status: e.target.value },
                                  `Estado en cocina actualizado a "${ORDER_STATUS_LABELS[e.target.value] || e.target.value}".`
                                )
                              }
                            >
                              {KITCHEN_STATUS_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!paginatedCampaignOrders.length && (
                  <tr>
                    <td colSpan={8} className="empty">
                      No hay pedidos en esta campaña con los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <DataTableFooter
            pagination={{
              page: safeCampPage,
              pageSize: campPageSize,
              total: filteredCampaignOrders.length,
              totalPages: campTotalPages,
              hasPrev: safeCampPage > 1,
              hasNext: safeCampPage < campTotalPages
            }}
            currentCount={paginatedCampaignOrders.length}
            loading={refreshing}
            onPageChange={setCampPage}
            ariaLabel="Paginación de pedidos por campaña"
            itemNoun="solicitudes de campaña"
          />
        </section>
      )}

      {/* SECCIÓN 2: TODAS LAS VENTAS REALIZADAS */}
      {activeTab === 'all' && (
        <section className="admin-list datatable-section" aria-label="Todas las ventas realizadas">
          <div className="section-heading admin-section-head">
            <div>
              <div className="datatable-title-row">
                <h2 id="sales-all-caption">Historial de Todas las Ventas Realizadas</h2>
                {refreshing && <Spinner size="sm" label="Actualizando ventas…" />}
              </div>
            </div>

            <div className="admin-toolbar">
              <div className="role-filter-group" role="group" aria-label="Filtrar ventas por estado de pago">
                {[
                  ['ALL', `Todas (${allOrders.length})`],
                  ['PAID', `Pagadas (${allOrders.filter(o => o.paymentStatus === 'PAID').length})`],
                  ['UNPAID', `Sin pagar (${allOrders.filter(o => o.paymentStatus === 'UNPAID').length})`],
                  ['CANCELLED', `Canceladas (${allOrders.filter(o => o.paymentStatus === 'CANCELLED').length})`]
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`filter-chip ${salesPaymentFilter === key ? 'active' : ''}`}
                    onClick={() => {
                      setSalesPaymentFilter(key);
                      setSalesPage(1);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="datatable-controls-right">
                <div className="datatable-pagesize">
                  <label htmlFor="sales-status-filter">Estado</label>
                  <select
                    id="sales-status-filter"
                    value={salesStatusFilter}
                    onChange={e => {
                      setSalesStatusFilter(e.target.value);
                      setSalesPage(1);
                    }}
                  >
                    <option value="ALL">Todos</option>
                    <option value="PENDING">Pendiente pago</option>
                    <option value="CONFIRMED">Confirmado</option>
                    <option value="PREPARING">Preparando</option>
                    <option value="READY">Listo</option>
                    <option value="DELIVERED">Entregado</option>
                    <option value="CANCELLED">Cancelado</option>
                  </select>
                </div>

                <div className="admin-search-field">
                  <label htmlFor="sales-all-search" className="visually-hidden">
                    Buscar venta por cliente, orden o hamburguesa
                  </label>
                  <input
                    id="sales-all-search"
                    type="search"
                    placeholder="Buscar # orden, cliente o burger…"
                    value={salesSearch}
                    onChange={e => {
                      setSalesSearch(e.target.value);
                      setSalesPage(1);
                    }}
                  />
                </div>

                <div className="datatable-pagesize">
                  <label htmlFor="sales-all-pagesize">Filas</label>
                  <select
                    id="sales-all-pagesize"
                    value={salesPageSize}
                    onChange={e => {
                      setSalesPageSize(Number(e.target.value));
                      setSalesPage(1);
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map(size => (
                      <option key={size} value={size}>
                        {size} / pág.
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div
            tabIndex={0}
            role="region"
            aria-labelledby="sales-all-caption"
            className="table-wrap responsive-table-region datatable-wrap"
          >
            <table className="admin-table datatable">
              <thead>
                <tr>
                  <th scope="col">
                    <button type="button" className="datatable-sort-btn" onClick={() => toggleSalesSort('id')}>
                      <span># Orden</span>
                      <span className="datatable-sort-icon" aria-hidden="true">
                        {salesSortBy === 'id' ? (salesSortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className="datatable-sort-btn" onClick={() => toggleSalesSort('customerName')}>
                      <span>Cliente y Entrega</span>
                      <span className="datatable-sort-icon" aria-hidden="true">
                        {salesSortBy === 'customerName' ? (salesSortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  </th>
                  <th scope="col">Origen</th>
                  <th scope="col">Hamburguesas Pedidas</th>
                  <th scope="col">
                    <button type="button" className="datatable-sort-btn" onClick={() => toggleSalesSort('totalBurgers')}>
                      <span>Unidades</span>
                      <span className="datatable-sort-icon" aria-hidden="true">
                        {salesSortBy === 'totalBurgers' ? (salesSortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className="datatable-sort-btn" onClick={() => toggleSalesSort('totalCop')}>
                      <span>Total COP</span>
                      <span className="datatable-sort-icon" aria-hidden="true">
                        {salesSortBy === 'totalCop' ? (salesSortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className="datatable-sort-btn" onClick={() => toggleSalesSort('paymentStatus')}>
                      <span>Pago</span>
                      <span className="datatable-sort-icon" aria-hidden="true">
                        {salesSortBy === 'paymentStatus' ? (salesSortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className="datatable-sort-btn" onClick={() => toggleSalesSort('status')}>
                      <span>Estado</span>
                      <span className="datatable-sort-icon" aria-hidden="true">
                        {salesSortBy === 'status' ? (salesSortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  </th>
                  <th scope="col" className="text-center" style={{ minWidth: '280px' }}>
                    Cambiar Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedSalesOrders.map(order => {
                  const isBusy = busyKey === `order-${order.id}`;
                  return (
                    <tr key={order.id}>
                      <th scope="row">
                        <div className="flex flex-col gap-0.5">
                          <strong className="font-mono text-white">#{order.id}</strong>
                          <span className="text-xs text-muted font-mono">{order.createdAt}</span>
                        </div>
                      </th>
                      <td>
                        <div className="flex flex-col gap-0.5">
                          <strong className="text-white text-sm">{order.customerName}</strong>
                          <span className="text-xs text-muted">{order.customerEmail}</span>
                          <span className="text-xs text-muted">
                            📞 {order.phone} · 📍 {order.deliveryAddress}
                          </span>
                        </div>
                      </td>
                      <td>
                        {order.campaignName ? (
                          <span className="voter-qty-badge" title={order.campaignName}>
                            🗳️ {order.campaignName}
                          </span>
                        ) : (
                          <span className="text-xs text-muted font-mono">🍔 Menú directo</span>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-col gap-1">
                          {(order.items || []).map(item => (
                            <div key={item.id} className="text-xs">
                              <strong className="text-white">
                                {item.quantity} × {item.burgerName}
                              </strong>
                              {item.removedIngredients?.length > 0 && (
                                <span className="text-muted">
                                  {' '}
                                  (Sin: {item.removedIngredients.join(', ')})
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className="voter-qty-badge">🍔 {order.totalBurgers} uds.</span>
                      </td>
                      <td>
                        <strong className="font-mono text-brand-amber">
                          {formatCop(order.totalCop)}
                        </strong>
                      </td>
                      <td>
                        <PaymentStatusPill status={order.paymentStatus} />
                      </td>
                      <td>
                        <OrderStatusPill status={order.status} />
                      </td>
                      <td>
                        <div className="sales-actions-stack">
                          <div className="action-toolbar">
                            {order.paymentStatus !== 'PAID' && (
                              <button
                                type="button"
                                className="action-chip action-chip-success"
                                disabled={isBusy}
                                onClick={() =>
                                  updateSaleOrder(
                                    order.id,
                                    { paymentStatus: 'PAID', status: 'CONFIRMED' },
                                    `Pedido #${order.id} marcado como Pagado y enviado a Cocina.`
                                  )
                                }
                              >
                                <span>✓ Pagado</span>
                              </button>
                            )}
                            {order.paymentStatus !== 'UNPAID' && (
                              <button
                                type="button"
                                className="action-chip action-chip-toggle"
                                disabled={isBusy}
                                onClick={() =>
                                  updateSaleOrder(
                                    order.id,
                                    { paymentStatus: 'UNPAID', status: 'PENDING' },
                                    `Pedido #${order.id} cambiado a Pendiente de pago.`
                                  )
                                }
                              >
                                <span>⏳ Pendiente</span>
                              </button>
                            )}
                            {order.status !== 'CANCELLED' && (
                              <button
                                type="button"
                                className="action-chip action-chip-delete"
                                disabled={isBusy}
                                onClick={() =>
                                  updateSaleOrder(
                                    order.id,
                                    { paymentStatus: 'CANCELLED', status: 'CANCELLED' },
                                    `Pedido #${order.id} cancelado.`
                                  )
                                }
                              >
                                <span>✕ Cancelar</span>
                              </button>
                            )}
                          </div>

                          <select
                            className="sales-inline-select"
                            aria-label={`Cambiar estado del pedido #${order.id}`}
                            disabled={isBusy}
                            value={order.status}
                            onChange={e =>
                              updateSaleOrder(
                                order.id,
                                { status: e.target.value },
                                `Pedido #${order.id} actualizado a "${ORDER_STATUS_LABELS[e.target.value] || e.target.value}".`
                              )
                            }
                          >
                            <option value="PENDING">Pendiente de pago</option>
                            {KITCHEN_STATUS_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!paginatedSalesOrders.length && (
                  <tr>
                    <td colSpan={9} className="empty">
                      No se encontraron ventas con los filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <DataTableFooter
            pagination={{
              page: safeSalesPage,
              pageSize: salesPageSize,
              total: filteredSalesOrders.length,
              totalPages: salesTotalPages,
              hasPrev: safeSalesPage > 1,
              hasNext: safeSalesPage < salesTotalPages
            }}
            currentCount={paginatedSalesOrders.length}
            loading={refreshing}
            onPageChange={setSalesPage}
            ariaLabel="Paginación de todas las ventas"
            itemNoun="ventas"
          />
        </section>
      )}
    </div>
  );
}

export default AdminSales;
