import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../../api.js';
import { evaluatePasswordRules } from '../../App.jsx';
import { AlertBanner, LoaderCard, Spinner, useToast } from '../../ui/Feedback.jsx';
import { createSortHelpers, DataTableFooter, PAGE_SIZE_OPTIONS } from './adminShared.jsx';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

const STAFF_ROLE_OPTIONS = [
  {
    value: 'CHEF',
    title: 'Cocinero / Chef',
    badge: 'CHEF',
    description: 'Acceso directo al Tablero de Cocina para preparar pedidos pagados y avanzar estados.'
  },
  {
    value: 'ADMIN',
    title: 'Administrador',
    badge: 'ADMIN',
    description: 'Control completo del backoffice: dashboard, productos, ciclos, ventas, usuarios y auditoría.'
  }
];

function EyeIcon({ open }) {
  return open ? (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function StaffUserModal({ open, onClose, onSaved }) {
  const initialForm = useMemo(
    () => ({
      name: '',
      email: '',
      role: 'CHEF',
      password: '',
      confirmPassword: ''
    }),
    []
  );

  const [form, setForm] = useState(initialForm);
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    password: false,
    confirmPassword: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showRulesHelp, setShowRulesHelp] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { notify } = useToast();
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (open) {
      setForm(initialForm);
      setTouched({
        name: false,
        email: false,
        password: false,
        confirmPassword: false
      });
      setShowPassword(false);
      setShowConfirmPassword(false);
      setShowRulesHelp(true);
      setError('');
    }
  }, [open, initialForm]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return undefined;

    const onPointerDown = event => {
      const rect = dialog.getBoundingClientRect();
      const clickedOutside =
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom;
      if (clickedOutside && !submitting) {
        onClose();
      }
    };

    dialog.addEventListener('pointerdown', onPointerDown);
    return () => dialog.removeEventListener('pointerdown', onPointerDown);
  }, [open, submitting, onClose]);

  const passwordRules = useMemo(() => evaluatePasswordRules(form.password), [form.password]);
  const metRulesCount = useMemo(
    () => passwordRules.filter(rule => rule.met).length,
    [passwordRules]
  );
  const allPasswordRulesMet = metRulesCount === passwordRules.length;

  const fieldErrors = useMemo(() => {
    const errors = {};
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      errors.name = 'El nombre completo es obligatorio.';
    } else if (trimmedName.length < 2) {
      errors.name = 'Ingresa al menos 2 caracteres para el nombre.';
    }

    const trimmedEmail = form.email.trim();
    if (!trimmedEmail) {
      errors.email = 'El correo electrónico es obligatorio.';
    } else if (!EMAIL_REGEX.test(trimmedEmail)) {
      errors.email = 'Ingresa un correo electrónico válido (ej. chef@secretbite.co).';
    }

    if (!['ADMIN', 'CHEF'].includes(form.role)) {
      errors.role = 'Selecciona un rol operativo válido (Administrador o Chef).';
    }

    if (!form.password) {
      errors.password = 'La contraseña es obligatoria.';
    } else {
      const firstUnmet = passwordRules.find(rule => !rule.met);
      if (firstUnmet) {
        errors.password = `Falta cumplir: ${firstUnmet.label}.`;
      }
    }

    if (!form.confirmPassword) {
      errors.confirmPassword = 'Debes confirmar la contraseña.';
    } else if (form.password !== form.confirmPassword) {
      errors.confirmPassword = 'Las contraseñas no coinciden. Verifica que ambas sean iguales.';
    } else if (!allPasswordRulesMet) {
      errors.confirmPassword = 'La contraseña principal aún no cumple todos los requisitos.';
    }

    return errors;
  }, [form, passwordRules, allPasswordRulesMet]);

  const isStaffFormValid = Object.keys(fieldErrors).length === 0;
  const passwordMismatch = touched.confirmPassword && Boolean(fieldErrors.confirmPassword);
  const passwordConfirmed =
    allPasswordRulesMet &&
    form.confirmPassword.length >= 8 &&
    form.password === form.confirmPassword;

  async function submit(event) {
    event.preventDefault();
    setTouched({
      name: true,
      email: true,
      password: true,
      confirmPassword: true
    });
    if (!isStaffFormValid) {
      const firstError =
        fieldErrors.name ||
        fieldErrors.email ||
        fieldErrors.role ||
        fieldErrors.password ||
        fieldErrors.confirmPassword;
      setError(firstError);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const response = await api('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          password: form.password,
          confirmPassword: form.confirmPassword
        })
      });
      const createdUser = response.user;
      const roleLabel = STAFF_ROLE_LABELS[createdUser.role] || createdUser.role;
      const msg = `Usuario "${createdUser.name}" creado con el rol de ${roleLabel}.`;
      notify({
        type: 'success',
        title: 'Usuario interno creado',
        message: msg
      });
      onSaved?.(msg);
      onClose();
    } catch (err) {
      setError(err.message);
      notify({
        type: 'error',
        title: 'No se pudo crear el usuario',
        message: err.message
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="admin-modal"
      closedby="any"
      aria-labelledby={titleId}
      onCancel={e => {
        e.preventDefault();
        if (!submitting) onClose();
      }}
    >
      <div className="admin-modal-surface">
        <header className="admin-modal-head">
          <div className="admin-modal-head-main">
            <div className="admin-modal-badge" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
            </div>
            <div className="admin-modal-title-box">
              <span className="eyebrow">EQUIPO OPERATIVO</span>
              <h3 id={titleId}>Crear nuevo usuario interno</h3>
            </div>
          </div>

          <div className="admin-modal-head-right">
            <span className={`status role-badge ${ROLE_BADGE_TONE[form.role] || ''}`}>
              {STAFF_ROLE_LABELS[form.role] || form.role}
            </span>
            <button
              type="button"
              className="alert-close modal-close-btn"
              onClick={onClose}
              disabled={submitting}
              aria-label="Cerrar modal"
            >
              ✕
            </button>
          </div>
        </header>

        <form className="admin-form admin-modal-form" method="post" onSubmit={submit} noValidate>
          <div className="admin-modal-body">
            {/* Selector de Rol Operativo: ADMIN o CHEF */}
            <div className="modal-field">
              <div className="modal-field-head">
                <span className="modal-field-label">
                  Rol asignado en el sistema <span className="required-mark">*</span>
                </span>
                <small className="field-hint">Elige el nivel de acceso</small>
              </div>
              <div className="staff-role-picker" role="radiogroup" aria-label="Seleccionar rol operativo">
                {STAFF_ROLE_OPTIONS.map(option => {
                  const selected = form.role === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`staff-role-option ${selected ? 'selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="staffRole"
                        value={option.value}
                        checked={selected}
                        onChange={() => setForm(prev => ({ ...prev, role: option.value }))}
                      />
                      <div className="staff-role-option-head">
                        <strong>{option.title}</strong>
                        <span className={`status role-badge ${ROLE_BADGE_TONE[option.value]}`}>
                          {option.badge}
                        </span>
                      </div>
                      <p>{option.description}</p>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Nombre y Correo */}
            <div className="modal-form-grid">
              <div className="modal-field">
                <div className="modal-field-head">
                  <label htmlFor="staff-user-name" className="modal-field-label">
                    Nombre completo <span className="required-mark">*</span>
                  </label>
                  <small className="field-hint">Mín. 2 caracteres</small>
                </div>
                <input
                  id="staff-user-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  minLength={2}
                  placeholder="Ej. Andrés Mejía"
                  aria-invalid={touched.name && Boolean(fieldErrors.name) ? 'true' : 'false'}
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  onBlur={() => setTouched(prev => ({ ...prev, name: true }))}
                  className="modal-field-input"
                />
                {touched.name && fieldErrors.name && (
                  <div className="auth-field-feedback error">
                    <span role="img" aria-label="Error">✕</span> {fieldErrors.name}
                  </div>
                )}
              </div>

              <div className="modal-field">
                <div className="modal-field-head">
                  <label htmlFor="staff-user-email" className="modal-field-label">
                    Correo electrónico <span className="required-mark">*</span>
                  </label>
                  <small className="field-hint">Obligatorio</small>
                </div>
                <input
                  id="staff-user-email"
                  name="email"
                  type="email"
                  autoComplete="off"
                  spellCheck={false}
                  required
                  placeholder="ej. chef2@secretbite.co"
                  aria-invalid={touched.email && Boolean(fieldErrors.email) ? 'true' : 'false'}
                  value={form.email}
                  onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                  onBlur={() => setTouched(prev => ({ ...prev, email: true }))}
                  className="modal-field-input"
                />
                {touched.email && fieldErrors.email && (
                  <div className="auth-field-feedback error">
                    <span role="img" aria-label="Error">✕</span> {fieldErrors.email}
                  </div>
                )}
              </div>
            </div>

            {/* Contraseña y Confirmación */}
            <div className="modal-form-grid">
              <div className="modal-field">
                <div className="modal-field-head">
                  <label htmlFor="staff-user-password" className="modal-field-label">
                    Contraseña <span className="required-mark">*</span>
                  </label>
                  <button
                    type="button"
                    className={`password-info-trigger ${allPasswordRulesMet ? 'all-met' : ''}`}
                    aria-expanded={showRulesHelp}
                    aria-controls="staff-password-rules"
                    onClick={() => setShowRulesHelp(prev => !prev)}
                  >
                    <span>ⓘ Requisitos ({metRulesCount}/{passwordRules.length})</span>
                  </button>
                </div>
                <div className="password-input-wrap">
                  <input
                    id="staff-user-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    placeholder="Ej. ChefPoli.2026*"
                    aria-invalid={touched.password && Boolean(fieldErrors.password) ? 'true' : 'false'}
                    value={form.password}
                    onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                    onBlur={() => setTouched(prev => ({ ...prev, password: true }))}
                    className="modal-field-input"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    aria-pressed={showPassword}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowPassword(v => !v)}
                  >
                    <EyeIcon open={showPassword} />
                    <span>{showPassword ? 'Ocultar' : 'Ver'}</span>
                  </button>
                </div>
                {touched.password && fieldErrors.password && (
                  <div className="auth-field-feedback error">
                    <span role="img" aria-label="Error">✕</span> {fieldErrors.password}
                  </div>
                )}
              </div>

              <div className="modal-field">
                <div className="modal-field-head">
                  <label htmlFor="staff-user-confirm-password" className="modal-field-label">
                    Confirmar contraseña <span className="required-mark">*</span>
                  </label>
                  <small className="field-hint">Debe coincidir</small>
                </div>
                <div className="password-input-wrap">
                  <input
                    id="staff-user-confirm-password"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    placeholder="Repite la contraseña"
                    aria-invalid={passwordMismatch ? 'true' : 'false'}
                    value={form.confirmPassword}
                    onChange={e =>
                      setForm(prev => ({ ...prev, confirmPassword: e.target.value }))
                    }
                    onBlur={() => setTouched(prev => ({ ...prev, confirmPassword: true }))}
                    className="modal-field-input"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    aria-pressed={showConfirmPassword}
                    aria-label={
                      showConfirmPassword
                        ? 'Ocultar confirmación de contraseña'
                        : 'Mostrar confirmación de contraseña'
                    }
                    onClick={() => setShowConfirmPassword(v => !v)}
                  >
                    <EyeIcon open={showConfirmPassword} />
                    <span>{showConfirmPassword ? 'Ocultar' : 'Ver'}</span>
                  </button>
                </div>
                {passwordMismatch && (
                  <div className="auth-field-feedback error">
                    <span role="img" aria-label="Error">✕</span> {fieldErrors.confirmPassword}
                  </div>
                )}
                {!passwordMismatch && passwordConfirmed && (
                  <div className="auth-field-feedback success">
                    <span aria-hidden="true">✓</span> Las contraseñas coinciden.
                  </div>
                )}
              </div>
            </div>

            {/* Checklist de requisitos de contraseña en verde */}
            <div
              id="staff-password-rules"
              className={`password-rules-box ${allPasswordRulesMet ? 'all-met' : ''}`}
              role="region"
              aria-label="Requisitos de seguridad de la contraseña"
            >
              <div className="password-rules-head">
                <span className="password-rules-title">
                  <span>
                    {allPasswordRulesMet
                      ? '¡Contraseña segura! Todos los requisitos están en verde'
                      : 'Reglas de seguridad de la contraseña:'}
                  </span>
                </span>
                <span className={`password-rules-badge ${allPasswordRulesMet ? 'met' : ''}`}>
                  {metRulesCount}/{passwordRules.length}
                </span>
              </div>
              <div className="password-strength-meter" aria-hidden="true">
                {passwordRules.map((rule, index) => (
                  <span
                    key={rule.id}
                    className={`strength-segment ${index < metRulesCount ? (allPasswordRulesMet ? 'met' : 'partial') : ''}`}
                  />
                ))}
              </div>
              {showRulesHelp && (
                <ul className="password-rules-list">
                  {passwordRules.map(rule => (
                    <li
                      key={rule.id}
                      className={`password-rule-item ${rule.met ? 'met' : 'pending'}`}
                    >
                      <span
                        className="password-rule-icon"
                        role="img"
                        aria-label={rule.met ? 'Cumplido' : 'Pendiente'}
                      >
                        {rule.met ? '✓' : '○'}
                      </span>
                      <span className="password-rule-text">{rule.label}</span>
                      <code className="password-rule-tag">{rule.detail}</code>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <AlertBanner
              type="error"
              title="No se pudo crear el usuario interno"
              message={error}
              onClose={() => setError('')}
            />
          </div>

          <footer className="admin-modal-footer">
            {!isStaffFormValid && (
              <span className="form-required-hint mr-auto">
                Completa los campos obligatorios (*) y las 4 reglas de contraseña para habilitar.
              </span>
            )}
            <button
              type="button"
              className="button ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="button"
              disabled={submitting || !isStaffFormValid}
            >
              {submitting ? (
                <>
                  <Spinner size="sm" label="Creando usuario interno…" />
                  <span>Creando…</span>
                </>
              ) : (
                `Crear ${form.role === 'ADMIN' ? 'Administrador' : 'Chef'}`
              )}
            </button>
          </footer>
        </form>
      </div>
    </dialog>
  );
}

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
  const [createModalOpen, setCreateModalOpen] = useState(false);
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
        title="Equipo operativo actualizado"
        message={notice}
        onClose={() => setNotice('')}
      />

      <StaffUserModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSaved={msg => {
          setNotice(msg);
          loadStaffPage();
        }}
      />

      <section className="admin-list datatable-section">
        <div className="section-heading admin-section-head">
          <div>
            <div className="datatable-title-row">
              <h2 id={staffCaptionId}>Usuarios internos</h2>
              {staffLoading && <Spinner size="sm" label="Cargando usuarios internos…" />}
            </div>
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

              <button
                type="button"
                className="button small"
                onClick={() => setCreateModalOpen(true)}
              >
                + Nuevo usuario
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
