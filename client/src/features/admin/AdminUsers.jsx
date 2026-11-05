import { useCallback, useEffect, useId, useState } from 'react';
import { api } from '../../api.js';
import { AlertBanner, LoaderCard, Spinner, useToast } from '../../ui/Feedback.jsx';
import { createSortHelpers, DataTableFooter, PAGE_SIZE_OPTIONS } from './adminShared.jsx';

const STAFF_ROLE_LABELS = {
  CHEF: 'Cocinero / Chef',
  ADMIN: 'Administrador'
};

const ROLE_BADGE_TONE = {
  CLIENT: 'role-client',
  CHEF: 'role-chef',
  ADMIN: 'role-admin'
};

const STAFF_ROLE_FILTERS = [
  ['ALL', 'Todo el equipo', 'STAFF'],
  ['ADMIN', 'Administradores', 'ADMIN'],
  ['CHEF', 'Cocina / Chefs', 'CHEF']
];

export default function AdminUsers() {
  const [staffUsers, setStaffUsers] = useState([]);
  const [roleCounts, setRoleCounts] = useState({ ALL: 0, STAFF: 0, ADMIN: 0, CHEF: 0, CLIENT: 0 });
  const [staffPagination, setStaffPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
    hasPrev: false,
    hasNext: false
  });
  const [staffPage, setStaffPage] = useState(1);
  const [staffPageSize, setStaffPageSize] = useState(10);
  const [staffRoleFilter, setStaffRoleFilter] = useState('ALL');
  const [staffQuery, setStaffQuery] = useState('');
  const [debouncedStaffQuery, setDebouncedStaffQuery] = useState('');
  const [staffSort, setStaffSort] = useState({ column: 'id', direction: 'desc' });
  const [staffLoading, setStaffLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { notify } = useToast();

  const staffCaptionId = useId();
  const staffSearchId = useId();
  const staffPageSizeId = useId();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedStaffQuery(staffQuery.trim()), 220);
    return () => clearTimeout(timer);
  }, [staffQuery]);

  const loadStaffPage = useCallback(async () => {
    setStaffLoading(true);
    try {
      const params = new URLSearchParams({
        scope: 'STAFF',
        page: String(staffPage),
        pageSize: String(staffPageSize),
        role: staffRoleFilter,
        sortBy: staffSort.column,
        sortDir: staffSort.direction
      });
      if (debouncedStaffQuery) {
        params.set('q', debouncedStaffQuery);
      }
      const data = await api(`/admin/users?${params.toString()}`);
      setStaffUsers(data.users || []);
      if (data.counts) setRoleCounts(data.counts);
      if (data.pagination) {
        setStaffPagination(data.pagination);
        if (data.pagination.page !== staffPage) {
          setStaffPage(data.pagination.page);
        }
      }
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setStaffLoading(false);
    }
  }, [staffPage, staffPageSize, staffRoleFilter, debouncedStaffQuery, staffSort]);

  useEffect(() => {
    loadStaffPage();
  }, [loadStaffPage]);

  async function setRole(id, role) {
    setNotice('');
    setError('');
    setBusyUserId(id);
    try {
      await api(`/admin/users/${id}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role })
      });
      const msg = `Rol operativo actualizado a ${STAFF_ROLE_LABELS[role] || role}.`;
      setNotice(msg);
      notify({ type: 'success', title: 'Permisos actualizados', message: msg });
      await loadStaffPage();
    } catch (err) {
      setError(err.message);
      notify({ type: 'error', title: 'No se pudo cambiar el rol', message: err.message });
    } finally {
      setBusyUserId(null);
    }
  }

  const staffSorting = createSortHelpers(staffSort, setStaffSort, setStaffPage);

  const hasActiveStaffFilters =
    Boolean(staffQuery.trim()) ||
    staffRoleFilter !== 'ALL' ||
    staffSort.column !== 'id' ||
    staffSort.direction !== 'desc';

  if (staffLoading && staffUsers.length === 0) {
    return (
      <LoaderCard
        compact
        title="Cargando equipo operativo (Admin y Chef)…"
        subtitle="Consultando integrantes y permisos de backoffice."
      />
    );
  }

  return (
    <>
      <AlertBanner
        type="error"
        title="Error en control de acceso o consulta de usuarios"
        message={error}
        onClose={() => setError('')}
      />
      <AlertBanner
        type="success"
        title="Permisos actualizados"
        message={notice}
        onClose={() => setNotice('')}
      />

      <section className="admin-list datatable-section">
        <div className="section-heading admin-section-head">
          <div>
            <span className="eyebrow">EQUIPO OPERATIVO · ADMIN Y CHEF</span>
            <div className="datatable-title-row">
              <h2 id={staffCaptionId}>Usuarios internos</h2>
              <span className="datatable-total-pill">
                {staffPagination.total} {staffPagination.total === 1 ? 'integrante' : 'integrantes'}
              </span>
              {staffLoading && <Spinner size="sm" label="Cargando usuarios internos…" />}
            </div>
            <p className="admin-section-sub">
              Personal administrativo y de cocina con acceso al backoffice y tablero de comandas.
            </p>
          </div>

          <div className="admin-toolbar datatable-toolbar">
            <div className="role-filter-group" role="group" aria-label="Filtrar equipo interno por rol">
              {STAFF_ROLE_FILTERS.map(([key, label, countKey]) => (
                <button
                  key={key}
                  type="button"
                  className={`filter-chip ${staffRoleFilter === key ? 'active' : ''}`}
                  onClick={() => {
                    setStaffRoleFilter(key);
                    setStaffPage(1);
                  }}
                >
                  {label} <b>{roleCounts[countKey] ?? 0}</b>
                </button>
              ))}
            </div>

            <div className="datatable-controls-right">
              <div className="admin-search-field">
                <label htmlFor={staffSearchId} className="visually-hidden">
                  Buscar integrante por nombre, correo o ID
                </label>
                <input
                  id={staffSearchId}
                  name="staffSearch"
                  type="search"
                  placeholder="Buscar admin o chef…"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  value={staffQuery}
                  onChange={e => {
                    setStaffQuery(e.target.value);
                    setStaffPage(1);
                  }}
                />
              </div>

              <div className="datatable-pagesize">
                <label htmlFor={staffPageSizeId}>Filas</label>
                <select
                  id={staffPageSizeId}
                  name="staffPageSize"
                  value={staffPageSize}
                  onChange={e => {
                    setStaffPageSize(Number(e.target.value));
                    setStaffPage(1);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map(size => (
                    <option key={size} value={size}>
                      {size} / pág.
                    </option>
                  ))}
                </select>
              </div>

              {hasActiveStaffFilters && (
                <button
                  type="button"
                  className="button ghost small"
                  onClick={() => {
                    setStaffQuery('');
                    setDebouncedStaffQuery('');
                    setStaffRoleFilter('ALL');
                    setStaffSort({ column: 'id', direction: 'desc' });
                    setStaffPage(1);
                  }}
                >
                  Limpiar
                </button>
              )}

              <button
                type="button"
                className="button ghost small"
                disabled={staffLoading}
                onClick={loadStaffPage}
                aria-label="Actualizar tabla de equipo operativo"
              >
                ↻
              </button>
            </div>
          </div>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby={staffCaptionId}
          className={`table-wrap responsive-table-region datatable-wrap ${staffLoading ? 'is-fetching' : ''}`}
        >
          <table className="admin-table users-table datatable">
            <thead>
              <tr>
                <th scope="col" aria-sort={staffSorting.ariaSort('name')}>
                  <button
                    type="button"
                    className="datatable-sort-btn"
                    onClick={() => staffSorting.toggle('name')}
                  >
                    <span>Integrante</span>
                    {staffSorting.indicator('name')}
                  </button>
                </th>
                <th scope="col" aria-sort={staffSorting.ariaSort('email')}>
                  <button
                    type="button"
                    className="datatable-sort-btn"
                    onClick={() => staffSorting.toggle('email')}
                  >
                    <span>Correo electrónico</span>
                    {staffSorting.indicator('email')}
                  </button>
                </th>
                <th
                  scope="col"
                  aria-sort={staffSorting.ariaSort('role')}
                  style={{ minWidth: '150px', width: '150px', maxWidth: '150px' }}
                >
                  <button
                    type="button"
                    className="datatable-sort-btn"
                    onClick={() => staffSorting.toggle('role')}
                  >
                    <span>Rol operativo</span>
                    {staffSorting.indicator('role')}
                  </button>
                </th>
                <th
                  scope="col"
                  className="text-center"
                  style={{ minWidth: '170px', width: '170px', maxWidth: '170px' }}
                >
                  Asignar rol interno
                </th>
              </tr>
            </thead>
            <tbody>
              {staffUsers.map(user => {
                const updatingRole = busyUserId === user.id;
                return (
                  <tr key={user.id}>
                    <th scope="row">
                      <div className="user-cell">
                        <span
                          className={`user-cell-avatar ${ROLE_BADGE_TONE[user.role] || ''}`}
                          aria-hidden="true"
                        >
                          {user.name.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <strong>{user.name}</strong>
                          <small>ID #{user.id}</small>
                        </div>
                      </div>
                    </th>
                    <td>
                      <span className="mono-cell">{user.email}</span>
                    </td>
                    <td>
                      <span className={`status role-badge ${ROLE_BADGE_TONE[user.role] || ''}`}>
                        {user.role}
                      </span>
                    </td>
                    <td>
                      <div className="role-select-wrap">
                        <label className="visually-hidden" htmlFor={`role-select-${user.id}`}>
                          Rol interno para {user.name}
                        </label>
                        <select
                          id={`role-select-${user.id}`}
                          name={`role-${user.id}`}
                          className="auto-fit-select"
                          disabled={updatingRole}
                          value={user.role}
                          onChange={event => setRole(user.id, event.target.value)}
                        >
                          {Object.entries(STAFF_ROLE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        {updatingRole && (
                          <Spinner size="sm" label={`Actualizando rol de ${user.name}`} />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!staffUsers.length && !staffLoading && (
                <tr>
                  <td colSpan={4} className="empty-table-cell">
                    No se encontraron integrantes del equipo con ese criterio de búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <DataTableFooter
          pagination={staffPagination}
          currentCount={staffUsers.length}
          loading={staffLoading}
          onPageChange={setStaffPage}
          ariaLabel="Paginación de usuarios internos"
          itemNoun="integrantes"
        />
      </section>
    </>
  );
}

