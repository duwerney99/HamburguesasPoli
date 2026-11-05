import { useCallback, useEffect, useId, useState } from 'react';
import { api } from '../../api.js';
import { AlertBanner, LoaderCard, Spinner } from '../../ui/Feedback.jsx';
import { createSortHelpers, DataTableFooter, PAGE_SIZE_OPTIONS } from './adminShared.jsx';

export default function AdminClients() {
  const [clients, setClients] = useState([]);
  const [clientsPagination, setClientsPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
    hasPrev: false,
    hasNext: false
  });
  const [clientsPage, setClientsPage] = useState(1);
  const [clientsPageSize, setClientsPageSize] = useState(10);
  const [clientsQuery, setClientsQuery] = useState('');
  const [debouncedClientsQuery, setDebouncedClientsQuery] = useState('');
  const [clientsSort, setClientsSort] = useState({ column: 'id', direction: 'desc' });
  const [clientsLoading, setClientsLoading] = useState(true);
  const [error, setError] = useState('');

  const clientsCaptionId = useId();
  const clientsSearchId = useId();
  const clientsPageSizeId = useId();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedClientsQuery(clientsQuery.trim()), 220);
    return () => clearTimeout(timer);
  }, [clientsQuery]);

  const loadClientsPage = useCallback(async () => {
    setClientsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(clientsPage),
        pageSize: String(clientsPageSize),
        sortBy: clientsSort.column,
        sortDir: clientsSort.direction
      });
      if (debouncedClientsQuery) {
        params.set('q', debouncedClientsQuery);
      }
      const data = await api(`/admin/clients?${params.toString()}`);
      setClients(data.clients || data.users || []);
      if (data.pagination) {
        setClientsPagination(data.pagination);
        if (data.pagination.page !== clientsPage) {
          setClientsPage(data.pagination.page);
        }
      }
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setClientsLoading(false);
    }
  }, [clientsPage, clientsPageSize, debouncedClientsQuery, clientsSort]);

  useEffect(() => {
    loadClientsPage();
  }, [loadClientsPage]);

  const clientsSorting = createSortHelpers(clientsSort, setClientsSort, setClientsPage);

  const hasActiveClientsFilters =
    Boolean(clientsQuery.trim()) ||
    clientsSort.column !== 'id' ||
    clientsSort.direction !== 'desc';

  if (clientsLoading && clients.length === 0) {
    return (
      <LoaderCard
        compact
        title="Cargando directorio de clientes…"
        subtitle="Consultando listado paginado de miembros del club."
      />
    );
  }

  return (
    <>
      <AlertBanner
        type="error"
        title="Error al consultar el directorio de clientes"
        message={error}
        onClose={() => setError('')}
      />

      <section className="admin-list datatable-section">
        <div className="section-heading admin-section-head">
          <div>
            <span className="eyebrow">COMUNIDAD · MIEMBROS DEL CLUB</span>
            <div className="datatable-title-row">
              <h2 id={clientsCaptionId}>Directorio de clientes</h2>
              <span className="datatable-total-pill">
                {clientsPagination.total}{' '}
                {clientsPagination.total === 1 ? 'cliente registrado' : 'clientes registrados'}
              </span>
              {clientsLoading && <Spinner size="sm" label="Cargando directorio de clientes…" />}
            </div>
            <p className="admin-section-sub">
              Listado paginado de miembros con cuenta de cliente (`CLIENT`). El rol de cliente es fijo y de solo lectura.
            </p>
          </div>

          <div className="admin-toolbar datatable-toolbar">
            <div className="client-readonly-note">
              <span className="status role-client">ROL FIJO · CLIENT</span>
              <small>Los clientes participan en votaciones y pedidos; no tienen permisos de administración.</small>
            </div>

            <div className="datatable-controls-right">
              <div className="admin-search-field">
                <label htmlFor={clientsSearchId} className="visually-hidden">
                  Buscar cliente por nombre, correo o ID
                </label>
                <input
                  id={clientsSearchId}
                  name="clientsSearch"
                  type="search"
                  placeholder="Buscar cliente por nombre, correo o ID…"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  value={clientsQuery}
                  onChange={e => {
                    setClientsQuery(e.target.value);
                    setClientsPage(1);
                  }}
                />
              </div>

              <div className="datatable-pagesize">
                <label htmlFor={clientsPageSizeId}>Filas</label>
                <select
                  id={clientsPageSizeId}
                  name="clientsPageSize"
                  value={clientsPageSize}
                  onChange={e => {
                    setClientsPageSize(Number(e.target.value));
                    setClientsPage(1);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map(size => (
                    <option key={size} value={size}>
                      {size} / pág.
                    </option>
                  ))}
                </select>
              </div>

              {hasActiveClientsFilters && (
                <button
                  type="button"
                  className="button ghost small"
                  onClick={() => {
                    setClientsQuery('');
                    setDebouncedClientsQuery('');
                    setClientsSort({ column: 'id', direction: 'desc' });
                    setClientsPage(1);
                  }}
                >
                  Limpiar
                </button>
              )}

              <button
                type="button"
                className="button ghost small"
                disabled={clientsLoading}
                onClick={loadClientsPage}
                aria-label="Actualizar tabla de clientes"
              >
                ↻
              </button>
            </div>
          </div>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby={clientsCaptionId}
          className={`table-wrap responsive-table-region datatable-wrap ${clientsLoading ? 'is-fetching' : ''} rounded-b-none`}
        >
          <table className="admin-table clients-table datatable">
            <thead>
              <tr>
                <th
                  scope="col"
                  aria-sort={clientsSorting.ariaSort('name')}
                  style={{ minWidth: '250px', width: '250px', maxWidth: '250px' }}
                >
                  <button
                    type="button"
                    className="datatable-sort-btn"
                    onClick={() => clientsSorting.toggle('name')}
                  >
                    <span>Cliente</span>
                    {clientsSorting.indicator('name')}
                  </button>
                </th>
                <th
                  scope="col"
                  aria-sort={clientsSorting.ariaSort('email')}
                  style={{ minWidth: '250px', width: '250px', maxWidth: '250px' }}
                >
                  <button
                    type="button"
                    className="datatable-sort-btn"
                    onClick={() => clientsSorting.toggle('email')}
                  >
                    <span>Correo electrónico</span>
                    {clientsSorting.indicator('email')}
                  </button>
                </th>
                <th
                  scope="col"
                  aria-sort={clientsSorting.ariaSort('ordersCount')}
                  style={{ minWidth: '220px', width: '220px', maxWidth: '220px' }}
                >
                  <button
                    type="button"
                    className="datatable-sort-btn"
                    onClick={() => clientsSorting.toggle('ordersCount')}
                  >
                    <span>Actividad en el club</span>
                    {clientsSorting.indicator('ordersCount')}
                  </button>
                </th>
                <th scope="col">Tipo de cuenta</th>
                <th
                  scope="col"
                  aria-sort={clientsSorting.ariaSort('id')}
                  style={{ minWidth: '160px', width: '160px', maxWidth: '160px' }}
                >
                  <button
                    type="button"
                    className="datatable-sort-btn"
                    onClick={() => clientsSorting.toggle('id')}
                  >
                    <span>Fecha de registro</span>
                    {clientsSorting.indicator('id')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {clients.map(client => (
                <tr key={client.id}>
                  <th scope="row">
                    <div className="user-cell">
                      <span className="user-cell-avatar role-client" aria-hidden="true">
                        {client.name.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <strong>{client.name}</strong>
                        <small>ID #{client.id}</small>
                      </div>
                    </div>
                  </th>
                  <td>
                    <span className="mono-cell">{client.email}</span>
                  </td>
                  <td>
                    <div className="meta-chips">
                      <span className="meta-chip">
                        Votos: <b className="chip-stat">{client.votesCount ?? 0}</b>
                      </span>
                      <span className="meta-chip">
                        Deseadas: <b className="chip-stat">{client.desiredBurgersCount ?? 0} uds.</b>
                      </span>
                      <span className="meta-chip">
                        Pedidos: <b className="chip-stat">{client.ordersCount ?? 0}</b>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="status role-badge role-client">Cliente del club</span>
                  </td>
                  <td>
                    {client.createdAt ? (
                      <time className="mono-cell" dateTime={client.createdAt}>
                        {new Date(client.createdAt).toLocaleString('es-CO')}
                      </time>
                    ) : (
                      <span className="muted-dash">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!clients.length && !clientsLoading && (
                <tr>
                  <td colSpan={5} className="empty-table-cell">
                    No se encontraron clientes registrados con ese criterio de búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <DataTableFooter
          pagination={clientsPagination}
          currentCount={clients.length}
          loading={clientsLoading}
          onPageChange={setClientsPage}
          ariaLabel="Paginación de clientes"
          itemNoun="clientes"
        />
      </section>
    </>
  );
}

