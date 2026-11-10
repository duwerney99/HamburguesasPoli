import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { AlertBanner, LoaderCard, Spinner, useToast } from '../ui/Feedback.jsx';
import { DataTableFooter, formatCop, PAGE_SIZE_OPTIONS } from './admin/adminShared.jsx';

const labels = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmado (En cola)',
  PREPARING: 'Preparando en parrilla',
  READY: 'Listo para entregar',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado'
};

export function Kitchen() {
  const [data, setData] = useState({
    orders: [],
    paidOrders: [],
    productionSummary: {
      totalPaidOrders: 0,
      activePaidOrders: 0,
      totalBurgersToMake: 0,
      totalBurgersQueued: 0,
      totalBurgersInGrill: 0,
      totalBurgersReady: 0,
      totalBurgersDelivered: 0,
      totalBurgersPaid: 0,
      byBurger: []
    },
    clientBreakdown: [],
    transitions: {}
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeTab, setActiveTab] = useState('comandas'); // 'comandas' | 'clientes' | 'entregados'
  const [statusFilter, setStatusFilter] = useState('ALL');

  // DataTable states for "Hamburguesas por Cliente (Pagados)"
  const [clientSearch, setClientSearch] = useState('');
  const [clientSortBy, setClientSortBy] = useState('totalBurgers');
  const [clientSortDir, setClientSortDir] = useState('desc');
  const [clientPage, setClientPage] = useState(1);
  const [clientPageSize, setClientPageSize] = useState(10);

  const { notify } = useToast();

  const load = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const response = await api('/kitchen/orders');
      setData(prev => ({
        ...prev,
        ...response,
        paidOrders:
          response.paidOrders ||
          (response.orders || []).filter(o => o.isPaid && o.status !== 'CANCELLED')
      }));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const id = setInterval(() => load(false), 10000);
    return () => clearInterval(id);
  }, [load]);

  async function change(id, nextStatus) {
    const key = `${id}-${nextStatus}`;
    setBusyKey(key);
    setError('');
    try {
      await api(`/kitchen/orders/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus })
      });
      await load(false);
      const msg = `Comanda #${id} avanzada a "${labels[nextStatus] || nextStatus}".`;
      setNotice(msg);
      notify({
        type: 'success',
        title: 'Comanda actualizada',
        message: msg
      });
    } catch (err) {
      setError(err.message);
      notify({
        type: 'error',
        title: 'Error en cocina',
        message: err.message
      });
    } finally {
      setBusyKey('');
    }
  }

  // Solo pedidos pagados entran a cocina
  const paidOrders = useMemo(
    () =>
      (data.paidOrders || []).filter(
        order => order.paymentStatus === 'PAID' && order.status !== 'CANCELLED'
      ),
    [data.paidOrders]
  );

  const activePaidOrders = useMemo(
    () =>
      paidOrders.filter(order => {
        if (order.status === 'DELIVERED' || order.status === 'CANCELLED') return false;
        if (statusFilter !== 'ALL' && order.status !== statusFilter) return false;
        return true;
      }),
    [paidOrders, statusFilter]
  );

  const deliveredPaidOrders = useMemo(
    () => paidOrders.filter(order => order.status === 'DELIVERED'),
    [paidOrders]
  );

  const production = data.productionSummary || {
    totalPaidOrders: 0,
    activePaidOrders: 0,
    totalBurgersToMake: 0,
    totalBurgersQueued: 0,
    totalBurgersInGrill: 0,
    totalBurgersReady: 0,
    totalBurgersDelivered: 0,
    totalBurgersPaid: 0,
    byBurger: []
  };

  const clientBreakdown = data.clientBreakdown || [];

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    const filtered = clientBreakdown.filter(client => {
      if (!q) return true;
      const burgersText = (client.itemsSummary || [])
        .map(item => item.burgerName)
        .join(' ')
        .toLowerCase();
      return (
        (client.customerName || '').toLowerCase().includes(q) ||
        (client.customerEmail || '').toLowerCase().includes(q) ||
        (client.phone || '').toLowerCase().includes(q) ||
        (client.deliveryAddress || '').toLowerCase().includes(q) ||
        burgersText.includes(q)
      );
    });

    const dir = clientSortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (clientSortBy === 'customerName') {
        return (a.customerName || '').localeCompare(b.customerName || '', 'es') * dir;
      }
      if (clientSortBy === 'burgersToMake') {
        return (a.burgersToMake - b.burgersToMake) * dir;
      }
      if (clientSortBy === 'totalPaidCop') {
        return (a.totalPaidCop - b.totalPaidCop) * dir;
      }
      return (a.totalBurgers - b.totalBurgers || a.burgersToMake - b.burgersToMake) * dir;
    });
  }, [clientBreakdown, clientSearch, clientSortBy, clientSortDir]);

  const clientTotalPages = Math.max(1, Math.ceil(filteredClients.length / clientPageSize));
  const safeClientPage = Math.min(clientPage, clientTotalPages);
  const paginatedClients = useMemo(() => {
    const start = (safeClientPage - 1) * clientPageSize;
    return filteredClients.slice(start, start + clientPageSize);
  }, [filteredClients, safeClientPage, clientPageSize]);

  function toggleClientSort(column) {
    setClientPage(1);
    if (clientSortBy === column) {
      setClientSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setClientSortBy(column);
      setClientSortDir(column === 'customerName' ? 'asc' : 'desc');
    }
  }

  return (
    <div className="dashboard-module">
      <div className="dashboard-top-bar">
        <div>
          <span className="eyebrow">ESTACIÓN DE COCINA · SOLO PEDIDOS PAGADOS</span>
          <h2 className="dashboard-heading">
            Tablero de Producción del Chef
          </h2>
          <p className="text-xs text-muted">
            Aquí únicamente aparecen las hamburguesas y pedidos con pago confirmado (✓ Pagado). Sincronización automática cada 10s.
          </p>
        </div>
        <button
          type="button"
          className="button ghost small"
          disabled={refreshing}
          onClick={() => load(true)}
        >
          {refreshing ? (
            <>
              <Spinner size="sm" label="Actualizando cocina…" />
              <span>Actualizando…</span>
            </>
          ) : (
            '↻ Actualizar cocina'
          )}
        </button>
      </div>

      <AlertBanner
        type="error"
        title="No se pudo actualizar la comanda"
        message={error}
        onClose={() => setError('')}
      />
      <AlertBanner
        type="success"
        title="Movimiento en parrilla"
        message={notice}
        onClose={() => setNotice('')}
      />

      {loading ? (
        <LoaderCard
          title="Cargando tablero de producción del Chef…"
          subtitle="Calculando hamburguesas pagadas por preparar y pedidos por cliente."
        />
      ) : (
        <div className="kitchen-stack">
          {/* 4 KPIs de Producción para el Chef */}
          <section className="stats-grid" aria-label="Resumen de hamburguesas para el Chef">
            <div className="kpi-card kpi-orange">
              <small>Hamburguesas por hacer (Chef)</small>
              <strong>{production.totalBurgersToMake}</strong>
              <span className="kpi-sub">
                {production.totalBurgersQueued} en cola · {production.totalBurgersInGrill} en parrilla
              </span>
            </div>

            <div className="kpi-card kpi-amber">
              <small>En parrilla ahora mismo</small>
              <strong>{production.totalBurgersInGrill}</strong>
              <span className="kpi-sub">Unidades en cocción activa</span>
            </div>

            <div className="kpi-card kpi-green">
              <small>Listas para entregar</small>
              <strong>{production.totalBurgersReady}</strong>
              <span className="kpi-sub">
                {production.totalBurgersDelivered} entregadas en total
              </span>
            </div>

            <button
              type="button"
              className="kpi-card kpi-card-button kpi-purple"
              onClick={() => setActiveTab('clientes')}
            >
              <small>Clientes con pedidos pagados</small>
              <strong>{clientBreakdown.length}</strong>
              <span className="kpi-sub">
                {production.totalPaidOrders} pedidos pagados ({production.totalBurgersPaid} burgers)
              </span>
            </button>
          </section>

          {/* TABLERO DE RECETAS DEL CHEF: ¿Cuántas hamburguesas tiene que hacer de cada una? */}
          <section className="kitchen-production-board" aria-label="Hamburguesas que debe preparar el Chef por receta">
            <header className="kitchen-board-header">
              <div>
                <span className="eyebrow">CONSOLIDADO DE PARRILLA POR RECETA</span>
                <h2>¿Cuántas hamburguesas tiene que hacer el Chef?</h2>
              </div>
              <span className="payment-pill payment-pill-paid">
                ✓ Solo contabiliza pedidos pagados ({production.totalBurgersToMake} pendientes de cocción)
              </span>
            </header>

            {production.byBurger?.length > 0 ? (
              <div className="kitchen-recipe-grid">
                {production.byBurger.map(recipe => (
                  <article
                    key={recipe.burgerId}
                    className={`kitchen-recipe-card ${recipe.toMakeQuantity > 0 ? 'has-pending' : 'all-done'}`}
                  >
                    <div className="kitchen-recipe-top">
                      <img
                        src={recipe.burgerImageUrl || '/assets/hero-burger.jpeg'}
                        alt={recipe.burgerName}
                        className="kitchen-recipe-thumb"
                      />
                      <div className="kitchen-recipe-title">
                        <h3>{recipe.burgerName}</h3>
                        <p>{recipe.ingredients}</p>
                      </div>
                      <div className="kitchen-recipe-counter" title="Hamburguesas por preparar de esta receta">
                        <strong>{recipe.toMakeQuantity}</strong>
                        <small>por hacer</small>
                      </div>
                    </div>

                    <div className="kitchen-recipe-metrics">
                      <span className="recipe-metric queued">
                        ⏳ En cola: <b>{recipe.queuedQuantity}</b>
                      </span>
                      <span className="recipe-metric grill">
                        🔥 En parrilla: <b>{recipe.preparingQuantity}</b>
                      </span>
                      <span className="recipe-metric ready">
                        ✓ Listas: <b>{recipe.readyQuantity}</b>
                      </span>
                      <span className="recipe-metric delivered">
                        📦 Entregadas: <b>{recipe.deliveredQuantity}</b>
                      </span>
                    </div>

                    <div className="kitchen-recipe-clients">
                      <small className="eyebrow">Pedidos pagados por cliente ({recipe.totalPaidQuantity} uds.):</small>
                      <ul>
                        {recipe.requests.slice(0, 5).map((req, idx) => (
                          <li key={`${req.orderId}-${idx}`}>
                            <span>
                              <b>{req.quantity}×</b> {req.customerName}{' '}
                              <em className="text-muted">(#{req.orderId})</em>
                            </span>
                            <span className={`status order-${req.status.toLowerCase()}`}>
                              {labels[req.status] || req.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty">
                Aún no hay hamburguesas pagadas registradas para producción en cocina.
              </p>
            )}
          </section>

          {/* Pestañas operativas de Cocina */}
          <div className="sales-tabs-bar" role="tablist" aria-label="Vistas operativas de cocina">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'comandas'}
              className={`sales-tab-btn ${activeTab === 'comandas' ? 'active' : ''}`}
              onClick={() => setActiveTab('comandas')}
            >
              <span>🔥 Comandas Pagadas Activas</span>
              <span className="sales-tab-badge">
                {paidOrders.filter(o => o.status !== 'DELIVERED').length}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'clientes'}
              className={`sales-tab-btn ${activeTab === 'clientes' ? 'active' : ''}`}
              onClick={() => setActiveTab('clientes')}
            >
              <span>👥 Hamburguesas por Cliente (Pagados)</span>
              <span className="sales-tab-badge">{clientBreakdown.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'entregados'}
              className={`sales-tab-btn ${activeTab === 'entregados' ? 'active' : ''}`}
              onClick={() => setActiveTab('entregados')}
            >
              <span>📦 Entregados</span>
              <span className="sales-tab-badge">{deliveredPaidOrders.length}</span>
            </button>
          </div>

          {/* PESTAÑA 1: COMANDAS PAGADAS EN PARRILLA */}
          {activeTab === 'comandas' && (
            <section className="stack" aria-label="Comandas pagadas activas">
              <div className="role-filter-group" role="group" aria-label="Filtrar comandas por etapa de cocina">
                {[
                  ['ALL', `Todas activas (${paidOrders.filter(o => o.status !== 'DELIVERED').length})`],
                  ['CONFIRMED', `En cola (${paidOrders.filter(o => o.status === 'CONFIRMED').length})`],
                  ['PREPARING', `En parrilla (${paidOrders.filter(o => o.status === 'PREPARING').length})`],
                  ['READY', `Listas (${paidOrders.filter(o => o.status === 'READY').length})`]
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`filter-chip ${statusFilter === key ? 'active' : ''}`}
                    onClick={() => setStatusFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="kitchen-grid">
                {!activePaidOrders.length && (
                  <p className="empty">
                    No hay comandas pagadas pendientes en esta etapa.
                  </p>
                )}
                {activePaidOrders.map(order => (
                  <article className="kitchen-ticket" key={order.id}>
                    <header>
                      <div>
                        <strong>
                          #{order.id} · {order.customerName}
                        </strong>
                        <div className="kitchen-ticket-badges">
                          <span className="payment-pill payment-pill-paid">✓ PAGADO</span>
                          <span className="voter-qty-badge">
                            🍔 {order.totalBurgers}{' '}
                            {order.totalBurgers === 1 ? 'hamburguesa' : 'hamburguesas'}
                          </span>
                        </div>
                      </div>
                      <span className={`status order-${order.status.toLowerCase()}`}>
                        {labels[order.status] || order.status}
                      </span>
                    </header>
                    <small>
                      {order.createdAt} · 📞 {order.phone} · 📍 {order.deliveryAddress}
                      {order.campaignName ? ` · 🗳️ ${order.campaignName}` : ''}
                    </small>
                    {order.items.map(item => (
                      <div className="kitchen-line" key={item.id}>
                        <b>
                          {item.quantity} × {item.burgerName}
                        </b>
                        <span>{item.ingredients}</span>
                        {item.removedIngredients.length > 0 && (
                          <em>RETIRAR: {item.removedIngredients.join(', ')}</em>
                        )}
                        {item.notes && <mark>{item.notes}</mark>}
                      </div>
                    ))}
                    <div className="ticket-actions">
                      {(data.transitions[order.status] || [])
                        .filter(next => next !== 'CANCELLED')
                        .map(next => {
                          const isBusy = busyKey === `${order.id}-${next}`;
                          return (
                            <button
                              type="button"
                              className="button small"
                              key={next}
                              disabled={Boolean(busyKey)}
                              onClick={() => change(order.id, next)}
                            >
                              {isBusy ? (
                                <>
                                  <Spinner size="sm" label={`Cambiando a ${labels[next]}`} />
                                  <span>{labels[next]}…</span>
                                </>
                              ) : (
                                labels[next]
                              )}
                            </button>
                          );
                        })}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* PESTAÑA 2: RESUMEN POR CLIENTE (CUÁNTAS HAMBURGUESAS PIDIÓ CADA CLIENTE PAGADO) */}
          {activeTab === 'clientes' && (
            <section
              className="admin-list datatable-section"
              aria-label="Resumen de hamburguesas pedidas por cliente pagado"
            >
              <div className="section-heading admin-section-head">
                <div>
                  <div className="datatable-title-row">
                    <h2 id="kitchen-clients-caption">
                      Hamburguesas Pedidas por Cliente (Solo Pagados)
                    </h2>
                  </div>
                </div>

                <div className="admin-toolbar">
                  <div className="datatable-controls-right">
                    <div className="admin-search-field">
                      <label htmlFor="kitchen-client-search" className="visually-hidden">
                        Buscar cliente o hamburguesa
                      </label>
                      <input
                        id="kitchen-client-search"
                        type="search"
                        placeholder="Buscar cliente, correo o receta…"
                        value={clientSearch}
                        onChange={e => {
                          setClientSearch(e.target.value);
                          setClientPage(1);
                        }}
                      />
                    </div>

                    <div className="datatable-pagesize">
                      <label htmlFor="kitchen-client-pagesize">Filas</label>
                      <select
                        id="kitchen-client-pagesize"
                        value={clientPageSize}
                        onChange={e => {
                          setClientPageSize(Number(e.target.value));
                          setClientPage(1);
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
                aria-labelledby="kitchen-clients-caption"
                className="table-wrap responsive-table-region datatable-wrap"
              >
                <table className="admin-table datatable">
                  <thead>
                    <tr>
                      <th scope="col">
                        <button
                          type="button"
                          className="datatable-sort-btn"
                          onClick={() => toggleClientSort('customerName')}
                        >
                          <span>Cliente Pagado</span>
                          <span className="datatable-sort-icon" aria-hidden="true">
                            {clientSortBy === 'customerName'
                              ? clientSortDir === 'asc'
                                ? '↑'
                                : '↓'
                              : '↕'}
                          </span>
                        </button>
                      </th>
                      <th scope="col">Estado Pago</th>
                      <th scope="col">
                        <button
                          type="button"
                          className="datatable-sort-btn"
                          onClick={() => toggleClientSort('totalBurgers')}
                        >
                          <span>Cuántas Hamburguesas Pidió</span>
                          <span className="datatable-sort-icon" aria-hidden="true">
                            {clientSortBy === 'totalBurgers'
                              ? clientSortDir === 'asc'
                                ? '↑'
                                : '↓'
                              : '↕'}
                          </span>
                        </button>
                      </th>
                      <th scope="col">
                        <button
                          type="button"
                          className="datatable-sort-btn"
                          onClick={() => toggleClientSort('burgersToMake')}
                        >
                          <span>Avance en Cocina</span>
                          <span className="datatable-sort-icon" aria-hidden="true">
                            {clientSortBy === 'burgersToMake'
                              ? clientSortDir === 'asc'
                                ? '↑'
                                : '↓'
                              : '↕'}
                          </span>
                        </button>
                      </th>
                      <th scope="col">Detalle de Recetas Pedidas</th>
                      <th scope="col">
                        <button
                          type="button"
                          className="datatable-sort-btn"
                          onClick={() => toggleClientSort('totalPaidCop')}
                        >
                          <span>Total Pagado</span>
                          <span className="datatable-sort-icon" aria-hidden="true">
                            {clientSortBy === 'totalPaidCop'
                              ? clientSortDir === 'asc'
                                ? '↑'
                                : '↓'
                              : '↕'}
                          </span>
                        </button>
                      </th>
                      <th scope="col">Órdenes Asociadas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedClients.map(client => (
                      <tr key={client.userId}>
                        <th scope="row">
                          <div className="flex flex-col gap-0.5">
                            <strong className="text-white text-sm">{client.customerName}</strong>
                            <span className="text-xs text-muted">{client.customerEmail}</span>
                            <span className="text-xs text-muted">
                              📞 {client.phone} · 📍 {client.deliveryAddress}
                            </span>
                          </div>
                        </th>
                        <td>
                          <span className="payment-pill payment-pill-paid">
                            ✓ Pagado ({client.paidOrdersCount}{' '}
                            {client.paidOrdersCount === 1 ? 'orden' : 'órdenes'})
                          </span>
                        </td>
                        <td>
                          <span className="voter-qty-badge">
                            🍔 {client.totalBurgers}{' '}
                            {client.totalBurgers === 1 ? 'hamburguesa' : 'hamburguesas'}
                          </span>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1.5 text-xs font-mono">
                            <span className="recipe-metric grill">
                              🔥 Por hacer: <b>{client.burgersToMake}</b>
                            </span>
                            <span className="recipe-metric ready">
                              ✓ Listas: <b>{client.burgersReady}</b>
                            </span>
                            <span className="recipe-metric delivered">
                              📦 Entregadas: <b>{client.burgersDelivered}</b>
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-col gap-1">
                            {(client.itemsSummary || []).map(item => (
                              <div key={item.burgerId} className="text-xs">
                                <strong className="text-white">
                                  {item.quantity} × {item.burgerName}
                                </strong>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td>
                          <strong className="font-mono text-brand-amber">
                            {formatCop(client.totalPaidCop)}
                          </strong>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {(client.orders || []).map(ord => (
                              <span
                                key={ord.id}
                                className={`status order-${ord.status.toLowerCase()}`}
                                title={`${ord.totalBurgers} burgers · ${labels[ord.status] || ord.status}`}
                              >
                                #{ord.id} ({ord.totalBurgers}u)
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}

                    {!paginatedClients.length && (
                      <tr>
                        <td colSpan={7} className="empty">
                          No hay clientes con pedidos pagados que coincidan con el filtro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <DataTableFooter
                pagination={{
                  page: safeClientPage,
                  pageSize: clientPageSize,
                  total: filteredClients.length,
                  totalPages: clientTotalPages,
                  hasPrev: safeClientPage > 1,
                  hasNext: safeClientPage < clientTotalPages
                }}
                currentCount={paginatedClients.length}
                loading={refreshing}
                onPageChange={setClientPage}
                ariaLabel="Paginación de clientes con pedidos pagados"
                itemNoun="clientes pagados"
              />
            </section>
          )}

          {/* PESTAÑA 3: ENTREGADOS */}
          {activeTab === 'entregados' && (
            <section className="kitchen-grid" aria-label="Pedidos pagados ya entregados">
              {!deliveredPaidOrders.length && (
                <p className="empty">Aún no hay comandas entregadas registradas.</p>
              )}
              {deliveredPaidOrders.map(order => (
                <article className="kitchen-ticket" key={order.id}>
                  <header>
                    <div>
                      <strong>
                        #{order.id} · {order.customerName}
                      </strong>
                      <div className="kitchen-ticket-badges">
                        <span className="payment-pill payment-pill-paid">✓ PAGADO</span>
                        <span className="voter-qty-badge">🍔 {order.totalBurgers} uds.</span>
                      </div>
                    </div>
                    <span className="status order-delivered">{labels.DELIVERED}</span>
                  </header>
                  <small>
                    {order.createdAt} · {order.deliveryAddress}
                  </small>
                  {order.items.map(item => (
                    <div className="kitchen-line" key={item.id}>
                      <b>
                        {item.quantity} × {item.burgerName}
                      </b>
                      <span>{item.ingredients}</span>
                    </div>
                  ))}
                </article>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default Kitchen;
