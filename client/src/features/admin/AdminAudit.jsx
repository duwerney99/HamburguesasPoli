import { useCallback, useEffect, useId, useState } from 'react';
import { api } from '../../api.js';
import { AlertBanner, LoaderCard, Spinner } from '../../ui/Feedback.jsx';
import { createSortHelpers, DataTableFooter, formatCop, PAGE_SIZE_OPTIONS } from './adminShared.jsx';

const AUDIT_ENTITY_FILTERS = [
  ['ALL', 'Todas'],
  ['BURGER', 'Catálogo'],
  ['CAMPAIGN', 'Campañas'],
  ['ORDER', 'Pedidos'],
  ['USER', 'Usuarios']
];

const actionTone = action => {
  if (!action) return 'audit-neutral';
  if (action.includes('REJECTED') || action.includes('CANCELLED') || action.includes('DELETED')) {
    return 'audit-danger';
  }
  if (action.includes('ROLE') || action.includes('CLOSED')) return 'audit-warning';
  if (action.includes('CREATED')) return 'audit-success';
  return 'audit-info';
};

function formatMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return [];
  return Object.entries(metadata).map(([key, value]) => {
    if (key === 'totalCop' && typeof value === 'number') {
      return `Total: ${formatCop(value)}`;
    }
    if (key === 'quantity') return `Cantidad deseada: ${value} uds.`;
    if (key === 'burgerId') return `Hamburguesa #${value}`;
    if (key === 'from' || key === 'to') return `${key}: ${value}`;
    return `${key}: ${String(value)}`;
  });
}

export default function AdminAudit() {
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditPagination, setAuditPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
    hasPrev: false,
    hasNext: false
  });
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(10);
  const [auditEntityFilter, setAuditEntityFilter] = useState('ALL');
  const [auditQuery, setAuditQuery] = useState('');
  const [debouncedAuditQuery, setDebouncedAuditQuery] = useState('');
  const [auditSort, setAuditSort] = useState({ column: 'id', direction: 'desc' });
  const [auditLoading, setAuditLoading] = useState(true);
  const [error, setError] = useState('');

  const auditCaptionId = useId();
  const auditSearchId = useId();
  const auditPageSizeId = useId();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedAuditQuery(auditQuery.trim()), 220);
    return () => clearTimeout(timer);
  }, [auditQuery]);

  const loadAuditPage = useCallback(async () => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(auditPage),
        pageSize: String(auditPageSize),
        entityType: auditEntityFilter,
        sortBy: auditSort.column,
        sortDir: auditSort.direction
      });
      if (debouncedAuditQuery) {
        params.set('q', debouncedAuditQuery);
      }
      const auditData = await api(`/admin/audit?${params.toString()}`);
      setAuditEntries(auditData.entries || []);
      if (auditData.pagination) {
        setAuditPagination(auditData.pagination);
        if (auditData.pagination.page !== auditPage) {
          setAuditPage(auditData.pagination.page);
        }
      }
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setAuditLoading(false);
    }
  }, [auditPage, auditPageSize, auditEntityFilter, debouncedAuditQuery, auditSort]);

  useEffect(() => {
    loadAuditPage();
  }, [loadAuditPage]);

  const auditSorting = createSortHelpers(auditSort, setAuditSort, setAuditPage);

  const hasActiveAuditFilters =
    Boolean(auditQuery.trim()) ||
    auditEntityFilter !== 'ALL' ||
    auditSort.column !== 'id' ||
    auditSort.direction !== 'desc';

  if (auditLoading && auditEntries.length === 0) {
    return (
      <LoaderCard
        compact
        title="Cargando bitácora de trazabilidad…"
        subtitle="Consultando eventos de auditoría paginados desde el servidor."
      />
    );
  }

  return (
    <>
      <AlertBanner
        type="error"
        title="Error al consultar el registro de auditoría"
        message={error}
        onClose={() => setError('')}
      />

      <section className="admin-list datatable-section">
        <div className="section-heading admin-section-head">
          <div>
            <div className="datatable-title-row">
              <h2 id={auditCaptionId}>Registro de auditoría</h2>
              {auditLoading && <Spinner size="sm" label="Cargando página de trazabilidad…" />}
            </div>
          </div>

          <div className="admin-toolbar datatable-toolbar">
            <div className="role-filter-group" role="group" aria-label="Filtrar eventos por entidad">
              {AUDIT_ENTITY_FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`filter-chip ${auditEntityFilter === key ? 'active' : ''}`}
                  onClick={() => {
                    setAuditEntityFilter(key);
                    setAuditPage(1);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="datatable-controls-right">
              <div className="admin-search-field">
                <label htmlFor={auditSearchId} className="visually-hidden">
                  Buscar en trazabilidad por acción, actor, entidad o detalle
                </label>
                <input
                  id={auditSearchId}
                  name="auditSearch"
                  type="search"
                  placeholder="Buscar acción, actor o detalle…"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  value={auditQuery}
                  onChange={e => {
                    setAuditQuery(e.target.value);
                    setAuditPage(1);
                  }}
                />
              </div>

              <div className="datatable-pagesize">
                <label htmlFor={auditPageSizeId}>Filas</label>
                <select
                  id={auditPageSizeId}
                  name="auditPageSize"
                  value={auditPageSize}
                  onChange={e => {
                    setAuditPageSize(Number(e.target.value));
                    setAuditPage(1);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map(size => (
                    <option key={size} value={size}>
                      {size} / pág.
                    </option>
                  ))}
                </select>
              </div>

              {hasActiveAuditFilters && (
                <button
                  type="button"
                  className="button ghost small"
                  onClick={() => {
                    setAuditQuery('');
                    setDebouncedAuditQuery('');
                    setAuditEntityFilter('ALL');
                    setAuditSort({ column: 'id', direction: 'desc' });
                    setAuditPage(1);
                  }}
                >
                  Limpiar
                </button>
              )}

              <button
                type="button"
                className="button ghost small"
                disabled={auditLoading}
                onClick={loadAuditPage}
                aria-label="Actualizar tabla de trazabilidad"
              >
                ↻
              </button>
            </div>
          </div>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby={auditCaptionId}
          className={`table-wrap responsive-table-region datatable-wrap ${auditLoading ? 'is-fetching' : ''} rounded-b-none`}
        >
          <table className="admin-table audit-table datatable">
            <thead>
              <tr>
                <th
                  scope="col"
                  aria-sort={auditSorting.ariaSort('action')}
                  style={{ minWidth: '200px', width: '200px', maxWidth: '200px' }}
                >
                  <button
                    type="button"
                    className="datatable-sort-btn"
                    onClick={() => auditSorting.toggle('action')}
                  >
                    <span>Evento / Acción</span>
                    {auditSorting.indicator('action')}
                  </button>
                </th>
                <th
                  scope="col"
                  aria-sort={auditSorting.ariaSort('actorName')}
                  style={{ minWidth: '200px', width: '200px' }}
                >
                  <button
                    type="button"
                    className="datatable-sort-btn"
                    onClick={() => auditSorting.toggle('actorName')}
                  >
                    <span>Actor responsable</span>
                    {auditSorting.indicator('actorName')}
                  </button>
                </th>
                <th
                  scope="col"
                  aria-sort={auditSorting.ariaSort('entityType')}
                  style={{ minWidth: '200px', width: '200px' }}
                >
                  <button
                    type="button"
                    className="datatable-sort-btn"
                    onClick={() => auditSorting.toggle('entityType')}
                  >
                    <span>Entidad afectada</span>
                    {auditSorting.indicator('entityType')}
                  </button>
                </th>
                <th scope="col" style={{ minWidth: '250px', width: '250px', maxWidth: '250px' }}>
                  Detalles
                </th>
                <th
                  scope="col"
                  aria-sort={auditSorting.ariaSort('id')}
                 style={{ minWidth: '220px', width: '220px', maxWidth: '220px' }}
                >
                  <button
                    type="button"
                    className="datatable-sort-btn"
                    onClick={() => auditSorting.toggle('id')}
                  >
                    <span>Fecha y hora</span>
                    {auditSorting.indicator('id')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.map(entry => {
                const metaItems = formatMetadata(entry.metadata);
                return (
                  <tr key={entry.id}>
                    <th scope="row" className="text-center">
                      <div className="audit-event-cell">
                        <span className={`status audit-badge ${actionTone(entry.action)}`}>
                          {entry.action}
                        </span>
                      </div>
                    </th>
                    <td>
                      <div className="actor-cell">
                        <strong>{entry.actorName || 'Sistema automático'}</strong>
                        {entry.actorEmail && <small>{entry.actorEmail}</small>}
                      </div>
                    </td>
                    <td>
                      <span className="entity-pill">
                        <b>{entry.entityType}</b>
                        {entry.entityId ? ` #${entry.entityId}` : ''}
                      </span>
                    </td>
                    <td>
                      {metaItems.length > 0 ? (
                        <div className="meta-chips">
                          {metaItems.map(item => (
                            <span key={item} className="meta-chip">
                              {item}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="muted-dash">—</span>
                      )}
                    </td>
                    <td>
                      <time className="mono-cell" dateTime={entry.createdAt}>
                        {new Date(entry.createdAt).toLocaleString('es-CO')}
                      </time>
                    </td>
                  </tr>
                );
              })}
              {!auditEntries.length && !auditLoading && (
                <tr>
                  <td colSpan={5} className="empty-table-cell">
                    No hay registros de auditoría que coincidan con el filtro actual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <DataTableFooter
          pagination={auditPagination}
          currentCount={auditEntries.length}
          loading={auditLoading}
          onPageChange={setAuditPage}
          ariaLabel="Paginación de trazabilidad"
          itemNoun="registros"
        />
      </section>
    </>
  );
}

