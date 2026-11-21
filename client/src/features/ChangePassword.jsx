import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { evaluatePasswordRules } from '../App.jsx';
import { AlertBanner, Spinner, useToast } from '../ui/Feedback.jsx';

const ROLE_LABELS = {
  ADMIN: 'Administrador',
  CHEF: 'Cocinero / Chef',
  CLIENT: 'Miembro del Club (Cliente)'
};

function EyeIcon({ open }) {
  return open ? (
    <svg
      width="18"
      height="18"
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
      width="18"
      height="18"
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

export default function ChangePassword({ user, isAdminPanel = false }) {
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [touched, setTouched] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showRulesHelp, setShowRulesHelp] = useState(true);
  const [status, setStatus] = useState({
    loading: false,
    error: '',
    success: ''
  });
  const { notify } = useToast();

  const passwordRules = useMemo(
    () => evaluatePasswordRules(form.newPassword),
    [form.newPassword]
  );
  const metRulesCount = useMemo(
    () => passwordRules.filter(rule => rule.met).length,
    [passwordRules]
  );
  const allPasswordRulesMet = metRulesCount === passwordRules.length;

  const fieldErrors = useMemo(() => {
    const errors = {};
    if (!form.currentPassword) {
      errors.currentPassword = 'Ingresa tu contraseña actual.';
    }

    if (!form.newPassword) {
      errors.newPassword = 'Ingresa tu nueva contraseña.';
    } else {
      const firstUnmet = passwordRules.find(rule => !rule.met);
      if (firstUnmet) {
        errors.newPassword = `Falta cumplir: ${firstUnmet.label}.`;
      } else if (
        form.currentPassword &&
        form.newPassword === form.currentPassword
      ) {
        errors.newPassword =
          'La nueva contraseña debe ser diferente a tu contraseña actual.';
      }
    }

    if (!form.confirmPassword) {
      errors.confirmPassword = 'Confirma tu nueva contraseña.';
    } else if (form.newPassword !== form.confirmPassword) {
      errors.confirmPassword =
        'Las contraseñas no coinciden. Verifica que la confirmación sea igual a la nueva contraseña.';
    } else if (!allPasswordRulesMet) {
      errors.confirmPassword =
        'La nueva contraseña aún no cumple todas las reglas de seguridad.';
    }

    return errors;
  }, [form, passwordRules, allPasswordRulesMet]);

  const isFormValid = Object.keys(fieldErrors).length === 0;
  const confirmMismatch = touched.confirmPassword && Boolean(fieldErrors.confirmPassword);
  const confirmMatched =
    allPasswordRulesMet &&
    !fieldErrors.newPassword &&
    form.confirmPassword.length >= 8 &&
    form.newPassword === form.confirmPassword;

  function updateField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (status.error || status.success) {
      setStatus(prev => ({ ...prev, error: '', success: '' }));
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setTouched({
      currentPassword: true,
      newPassword: true,
      confirmPassword: true
    });

    if (!isFormValid) {
      const firstError =
        fieldErrors.currentPassword ||
        fieldErrors.newPassword ||
        fieldErrors.confirmPassword;
      setStatus({ loading: false, error: firstError, success: '' });
      return;
    }

    setStatus({ loading: true, error: '', success: '' });
    try {
      const res = await api('/auth/password', {
        method: 'PUT',
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
          confirmPassword: form.confirmPassword
        })
      });

      const msg =
        res?.message || 'Tu contraseña ha sido actualizada exitosamente.';
      setForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setTouched({
        currentPassword: false,
        newPassword: false,
        confirmPassword: false
      });
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
      setStatus({ loading: false, error: '', success: msg });
      notify({
        type: 'success',
        title: 'Contraseña actualizada',
        message: msg
      });
    } catch (error) {
      setStatus({ loading: false, error: error.message, success: '' });
      notify({
        type: 'error',
        title: 'No se pudo cambiar la contraseña',
        message: error.message
      });
    }
  }

  return (
    <section className={isAdminPanel ? 'admin-list datatable-section' : 'orders-page'}>
      <div className="security-layout">
        <div className="security-card">
          <div className="security-card-head">
            <span className="eyebrow">SEGURIDAD DE LA CUENTA</span>
            <h2 id="change-password-heading">Cambiar contraseña</h2>
            <p>
              Ingresa tu contraseña actual y define una nueva contraseña segura para tu cuenta
              {user?.email ? ` (${user.email})` : ''}.
            </p>
            {user && (
              <div className="security-user-pill">
                <span className="user-avatar" aria-hidden="true">
                  {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </span>
                <div>
                  <strong>{user.name}</strong>
                  <small>{ROLE_LABELS[user.role] || user.role} · {user.email}</small>
                </div>
              </div>
            )}
          </div>

          <AlertBanner
            type="error"
            title="Revisa los datos ingresados"
            message={status.error}
            onClose={() => setStatus(prev => ({ ...prev, error: '' }))}
          />
          <AlertBanner
            type="success"
            title="Contraseña actualizada"
            message={status.success}
            onClose={() => setStatus(prev => ({ ...prev, success: '' }))}
          />

          <form
            className="security-form"
            onSubmit={handleSubmit}
            aria-labelledby="change-password-heading"
            noValidate
          >
            {/* 1. Contraseña actual */}
            <div className="auth-field">
              <div className="form-field-head">
                <label htmlFor="sec-current-password">
                  Contraseña actual <span className="required-mark">*</span>
                </label>
                <small className="field-hint">Obligatorio</small>
              </div>
              <div className="password-input-wrap">
                <input
                  id="sec-current-password"
                  name="currentPassword"
                  type={showCurrent ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Escribe tu contraseña actual"
                  required
                  aria-invalid={
                    touched.currentPassword && Boolean(fieldErrors.currentPassword)
                      ? 'true'
                      : 'false'
                  }
                  className={
                    touched.currentPassword
                      ? fieldErrors.currentPassword
                        ? 'input-mismatch'
                        : 'input-confirmed'
                      : ''
                  }
                  value={form.currentPassword}
                  onChange={e => updateField('currentPassword', e.target.value)}
                  onBlur={() =>
                    setTouched(prev => ({ ...prev, currentPassword: true }))
                  }
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  aria-pressed={showCurrent}
                  aria-label={
                    showCurrent
                      ? 'Ocultar contraseña actual'
                      : 'Mostrar contraseña actual'
                  }
                  onClick={() => setShowCurrent(v => !v)}
                >
                  <EyeIcon open={showCurrent} />
                  <span>{showCurrent ? 'Ocultar' : 'Ver'}</span>
                </button>
              </div>
              {touched.currentPassword && fieldErrors.currentPassword && (
                <div className="auth-field-feedback error">
                  <span role="img" aria-label="Error">✕</span> {fieldErrors.currentPassword}
                </div>
              )}
            </div>

            {/* 2. Nueva contraseña */}
            <div className="auth-field">
              <div className="form-field-head">
                <label htmlFor="sec-new-password">
                  Nueva contraseña <span className="required-mark">*</span>
                </label>
                <button
                  type="button"
                  className={`password-info-trigger ${allPasswordRulesMet ? 'all-met' : ''}`}
                  aria-expanded={showRulesHelp}
                  aria-controls="sec-password-rules"
                  onClick={() => setShowRulesHelp(prev => !prev)}
                >
                  <span>
                    ⓘ Requisitos ({metRulesCount}/{passwordRules.length})
                  </span>
                </button>
              </div>
              <div className="password-input-wrap">
                <input
                  id="sec-new-password"
                  name="newPassword"
                  type={showNew ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Ej. MiNuevaClave.2026*"
                  required
                  minLength={8}
                  aria-invalid={
                    touched.newPassword && Boolean(fieldErrors.newPassword)
                      ? 'true'
                      : 'false'
                  }
                  aria-describedby="sec-password-rules"
                  className={
                    touched.newPassword || form.newPassword.length > 0
                      ? fieldErrors.newPassword
                        ? touched.newPassword
                          ? 'input-mismatch'
                          : ''
                        : 'input-confirmed'
                      : ''
                  }
                  value={form.newPassword}
                  onChange={e => updateField('newPassword', e.target.value)}
                  onBlur={() =>
                    setTouched(prev => ({ ...prev, newPassword: true }))
                  }
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  aria-pressed={showNew}
                  aria-label={
                    showNew ? 'Ocultar nueva contraseña' : 'Mostrar nueva contraseña'
                  }
                  onClick={() => setShowNew(v => !v)}
                >
                  <EyeIcon open={showNew} />
                  <span>{showNew ? 'Ocultar' : 'Ver'}</span>
                </button>
              </div>

              <div
                id="sec-password-rules"
                className={`password-rules-box ${allPasswordRulesMet ? 'all-met' : ''}`}
                role="region"
                aria-label="Requisitos de la nueva contraseña"
              >
                <div className="password-rules-head">
                  <span className="password-rules-title">
                    <span>
                      {allPasswordRulesMet
                        ? '¡Nueva contraseña segura! Todos los requisitos están en verde'
                        : 'Tu nueva contraseña debe cumplir estas 4 reglas:'}
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

              {touched.newPassword && fieldErrors.newPassword && (
                <div className="auth-field-feedback error">
                  <span role="img" aria-label="Error">✕</span> {fieldErrors.newPassword}
                </div>
              )}
            </div>

            {/* 3. Confirmar nueva contraseña */}
            <div className="auth-field">
              <div className="form-field-head">
                <label htmlFor="sec-confirm-password">
                  Confirmar nueva contraseña <span className="required-mark">*</span>
                </label>
                <small className="field-hint">Debe coincidir</small>
              </div>
              <div className="password-input-wrap">
                <input
                  id="sec-confirm-password"
                  name="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repite tu nueva contraseña"
                  required
                  minLength={8}
                  aria-invalid={confirmMismatch ? 'true' : 'false'}
                  className={
                    confirmMismatch
                      ? 'input-mismatch'
                      : confirmMatched
                        ? 'input-confirmed'
                        : ''
                  }
                  value={form.confirmPassword}
                  onChange={e => updateField('confirmPassword', e.target.value)}
                  onBlur={() =>
                    setTouched(prev => ({ ...prev, confirmPassword: true }))
                  }
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  aria-pressed={showConfirm}
                  aria-label={
                    showConfirm
                      ? 'Ocultar confirmación de nueva contraseña'
                      : 'Mostrar confirmación de nueva contraseña'
                  }
                  onClick={() => setShowConfirm(v => !v)}
                >
                  <EyeIcon open={showConfirm} />
                  <span>{showConfirm ? 'Ocultar' : 'Ver'}</span>
                </button>
              </div>
              {confirmMismatch && (
                <div className="auth-field-feedback error">
                  <span role="img" aria-label="Error">✕</span> {fieldErrors.confirmPassword}
                </div>
              )}
              {!confirmMismatch && confirmMatched && (
                <div className="auth-field-feedback success">
                  <span aria-hidden="true">✓</span> La nueva contraseña y su confirmación coinciden.
                </div>
              )}
            </div>

            {!isFormValid && (
              <p className="form-required-hint" role="status">
                Completa la contraseña actual, cumple las 4 reglas en verde de la nueva contraseña y confírmala para habilitar el botón.
              </p>
            )}

            <button
              type="submit"
              className="button full"
              disabled={status.loading || !isFormValid}
            >
              {status.loading ? (
                <>
                  <Spinner size="sm" label="Actualizando contraseña…" />
                  <span>Actualizando contraseña…</span>
                </>
              ) : (
                'Actualizar contraseña'
              )}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
