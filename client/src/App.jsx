import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate
} from 'react-router-dom';
import {
  api,
  clearSessionTokens,
  hasSessionTokens,
  logoutSession,
  saveSessionTokens
} from './api.js';
import Orders from './features/Orders.jsx';
import ChangePassword from './features/ChangePassword.jsx';
import AdminLayout from './features/admin/AdminLayout.jsx';
import { formatCop } from './features/admin/adminShared.jsx';
import { AlertBanner, LoaderCard, Spinner, ToastProvider, useToast } from './ui/Feedback.jsx';

function useCountdown(endsAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, Date.parse(endsAt || 0) - now);
  const parts = {
    days: Math.floor(remaining / 86400000),
    hours: Math.floor(remaining / 3600000) % 24,
    minutes: Math.floor(remaining / 60000) % 60,
    seconds: Math.floor(remaining / 1000) % 60
  };
  return {
    remaining,
    parts,
    label: `${parts.days}d ${String(parts.hours).padStart(2, '0')}h ${String(parts.minutes).padStart(2, '0')}m ${String(parts.seconds).padStart(2, '0')}s`
  };
}

function Header({ user, logout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const roleBadge = {
    CLIENT: 'Club Member',
    CHEF: 'Cocina',
    ADMIN: 'Admin'
  };

  const isAdmin = location.pathname.startsWith('/admin');

  return (
    <header className="site-header">
      <Link className="brand" to="/" aria-label="Secret Bite, inicio">
        <span className="brand-mark">SB</span>
        <span>
          Secret <b>Bite</b>
          <small>Medellín · Burger club</small>
        </span>
      </Link>
      <nav className="site-nav" aria-label="Navegación principal">
        <NavLink to="/" end className={({ isActive }) => `site-nav-item ${isActive ? 'active' : ''}`}>
          <svg className="site-nav-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2c.5 2.5 2 4.5 4 6 2.5 2 4 4.5 4 8a8 8 0 1 1-16 0c0-3.5 1.5-6 4-8 2-1.5 3.5-3.5 4-6Z" />
          </svg>
          <span>Votación</span>
        </NavLink>
        {user?.role === 'CLIENT' && (
          <NavLink to="/pedidos" className={({ isActive }) => `site-nav-item ${isActive ? 'active' : ''}`}>
            <svg className="site-nav-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            <span>Pedidos</span>
          </NavLink>
        )}
        {user && (
          <NavLink to="/seguridad" className={({ isActive }) => `site-nav-item ${isActive ? 'active' : ''}`}>
            <svg className="site-nav-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>Cambiar contraseña</span>
          </NavLink>
        )}
        {user?.role === 'CHEF' && (
          <NavLink
            to="/admin/cocina"
            className={() => `site-nav-item ${isAdmin ? 'active' : ''}`}
          >
            <svg className="site-nav-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" x2="18" y1="17" y2="17"/>
            </svg>
            <span>Panel Cocina</span>
          </NavLink>
        )}
        {user?.role === 'ADMIN' && (
          <NavLink
            to={isAdmin ? location.pathname : '/admin/dashboard'}
            className={() => `site-nav-item ${isAdmin ? 'active' : ''}`}
          >
            <svg className="site-nav-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
            </svg>
            <span>Panel admin</span>
          </NavLink>
        )}
      </nav>
      <div className="session">
        {user ? (
          <>
            <div className="user-pill">
              <span className="user-avatar" aria-hidden="true">
                {user.name.charAt(0).toUpperCase()}
              </span>
              <span className="user-name">
                Hola, <strong>{user.name.split(' ')[0]}</strong>
                <small>{roleBadge[user.role] || user.role}</small>
              </span>
            </div>
            <button className="button ghost small" onClick={logout}>
              Salir
            </button>
          </>
        ) : (
          <button className="button small" onClick={() => navigate('/auth')}>
            Ingresar al club
          </button>
        )}
      </div>
    </header>
  );
}

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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function evaluatePasswordRules(password = '') {
  const value = String(password || '');
  return [
    {
      id: 'minLength',
      label: 'Mínimo 8 caracteres',
      detail: `${Math.min(value.length, 8)}/8`,
      met: value.length >= 8
    },
    {
      id: 'uppercase',
      label: 'Al menos 1 letra mayúscula (A–Z)',
      detail: 'A–Z',
      met: /[A-ZÁÉÍÓÚÑ]/.test(value)
    },
    {
      id: 'lowercase',
      label: 'Al menos 1 letra minúscula (a–z)',
      detail: 'a–z',
      met: /[a-záéíóúñ]/.test(value)
    },
    {
      id: 'special',
      label: 'Al menos 1 carácter especial (. - , * ! @ # $ % & _ +)',
      detail: '.-,*!@#',
      met: /[^A-Za-z0-9ÁÉÍÓÚáéíóúÑñ\s]/.test(value)
    }
  ];
}

function Auth({ onAuth, goHome }) {
  const [register, setRegister] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    password: false,
    confirmPassword: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showRulesHelp, setShowRulesHelp] = useState(true);
  const [status, setStatus] = useState({ loading: false, error: '' });
  const { notify } = useToast();

  const passwordRules = useMemo(() => evaluatePasswordRules(form.password), [form.password]);
  const metRulesCount = useMemo(
    () => passwordRules.filter(rule => rule.met).length,
    [passwordRules]
  );
  const allPasswordRulesMet = metRulesCount === passwordRules.length;

  const fieldErrors = useMemo(() => {
    const errors = {};
    if (register) {
      const trimmedName = form.name.trim();
      if (!trimmedName) {
        errors.name = 'El nombre completo es obligatorio.';
      } else if (trimmedName.length < 2) {
        errors.name = 'Ingresa al menos 2 caracteres para tu nombre.';
      }
    }

    const trimmedEmail = form.email.trim();
    if (!trimmedEmail) {
      errors.email = 'El correo electrónico es obligatorio.';
    } else if (!EMAIL_REGEX.test(trimmedEmail)) {
      errors.email = 'Ingresa un correo electrónico válido (ej. tu@correo.com).';
    }

    if (!form.password) {
      errors.password = 'La contraseña es obligatoria.';
    } else if (!register) {
      if (form.password.length < 8) {
        errors.password = `La contraseña debe tener mínimo 8 caracteres (llevas ${form.password.length}/8).`;
      }
    } else {
      const firstUnmet = passwordRules.find(rule => !rule.met);
      if (firstUnmet) {
        errors.password = `Falta cumplir: ${firstUnmet.label}.`;
      }
    }

    if (register) {
      if (!form.confirmPassword) {
        errors.confirmPassword = 'Debes confirmar tu contraseña.';
      } else if (form.password !== form.confirmPassword) {
        errors.confirmPassword = 'Las contraseñas no coinciden. Verifica que ambas sean iguales.';
      } else if (!allPasswordRulesMet) {
        errors.confirmPassword = 'La contraseña principal aún no cumple todos los requisitos.';
      }
    }

    return errors;
  }, [register, form, passwordRules, allPasswordRulesMet]);

  const isFormValid = Object.keys(fieldErrors).length === 0;

  const passwordMismatch =
    register &&
    touched.confirmPassword &&
    Boolean(fieldErrors.confirmPassword);

  const passwordConfirmed =
    register &&
    allPasswordRulesMet &&
    form.confirmPassword.length >= 8 &&
    form.password === form.confirmPassword;

  function updateField(field, value, inputEl) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (inputEl && typeof inputEl.setCustomValidity === 'function') {
      inputEl.setCustomValidity('');
    }
    if (status.error) {
      setStatus(s => ({ ...s, error: '' }));
    }
  }

  function markTouched(field) {
    setTouched(prev => ({ ...prev, [field]: true }));
  }

  async function submit(event) {
    event.preventDefault();
    setTouched({
      name: true,
      email: true,
      password: true,
      confirmPassword: true
    });

    if (!isFormValid) {
      const firstError =
        fieldErrors.name ||
        fieldErrors.email ||
        fieldErrors.password ||
        fieldErrors.confirmPassword ||
        'Completa todos los campos obligatorios correctamente.';
      setStatus({ loading: false, error: firstError });
      notify({
        type: 'error',
        title: 'Campos pendientes por diligenciar',
        message: firstError
      });
      return;
    }

    setStatus({ loading: true, error: '' });
    try {
      const payload = register
        ? {
            name: form.name.trim(),
            email: form.email.trim(),
            password: form.password,
            confirmPassword: form.confirmPassword
          }
        : {
            email: form.email.trim(),
            password: form.password
          };

      const data = await api(`/auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      notify({
        type: 'success',
        title: register ? 'Cuenta creada' : 'Sesión iniciada',
        message: `Bienvenido a Secret Bite, ${data.user.name.split(' ')[0]}.`
      });
      onAuth(data);
    } catch (error) {
      setStatus({ loading: false, error: error.message });
      notify({
        type: 'error',
        title: 'Error de autenticación',
        message: error.message
      });
    }
  }

  function toggleAuthMode() {
    setRegister(prev => !prev);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setTouched({
      name: false,
      email: false,
      password: false,
      confirmPassword: false
    });
    setForm(prev => ({ ...prev, password: '', confirmPassword: '' }));
    setStatus({ loading: false, error: '' });
  }

  return (
    <main className="auth-page">
      <section className="auth-copy">
        <span className="eyebrow">ACCESO A LA COMUNIDAD</span>
        <h1>
          Tu voto cambia
          <br />
          <em>el próximo menú.</em>
        </h1>
        <p>Una cuenta, un voto, una burger ganadora. Sin puntos, compras ni pasos innecesarios.</p>
        <div className="auth-showcase">
          <img src="/assets/secret-bite-mark.jpeg" alt="Ilustración del agente secreto de Secret Bite" />
          <div>
            <strong>Edición Mensual Medellín</strong>
            <span>Voto único verificado y pedidos personalizados directo a cocina.</span>
          </div>
        </div>
      </section>
      <section className="auth-card">
        <button type="button" className="back-link" onClick={goHome}>
          ← Volver a la campaña
        </button>
        <h2 id="auth-form-heading">{register ? 'Crea tu cuenta' : 'Bienvenido de vuelta'}</h2>
        <p>{register ? 'Únete y participa en la campaña activa.' : 'Ingresa para emitir o consultar tu voto.'}</p>
        <span id="password-toggle-warning" className="visually-hidden">
          Advertencia: esto mostrará tu contraseña en la pantalla.
        </span>
        <form onSubmit={submit} aria-labelledby="auth-form-heading" noValidate>
          {register && (
            <div className="auth-field">
              <div className="form-field-head">
                <label htmlFor="auth-fullname">
                  Nombre completo <span className="required-mark">*</span>
                </label>
                <small className="field-hint">Obligatorio</small>
              </div>
              <input
                id="auth-fullname"
                name="name"
                type="text"
                autoComplete="name"
                enterKeyHint="next"
                placeholder="Ej. Camila Restrepo"
                required
                minLength={2}
                aria-invalid={touched.name && Boolean(fieldErrors.name) ? 'true' : 'false'}
                aria-describedby={touched.name && fieldErrors.name ? 'auth-name-error' : undefined}
                className={
                  touched.name
                    ? fieldErrors.name
                      ? 'input-mismatch'
                      : 'input-confirmed'
                    : ''
                }
                value={form.name}
                onChange={e => updateField('name', e.target.value, e.currentTarget)}
                onBlur={() => markTouched('name')}
              />
              {touched.name && fieldErrors.name && (
                <div id="auth-name-error" className="auth-field-feedback error">
                  <span role="img" aria-label="Error">
                    ✕
                  </span>{' '}
                  {fieldErrors.name}
                </div>
              )}
            </div>
          )}

          <div className="auth-field">
            <div className="form-field-head">
              <label htmlFor="auth-email">
                Correo electrónico <span className="required-mark">*</span>
              </label>
              <small className="field-hint">Obligatorio</small>
            </div>
            <input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="username"
              spellCheck={false}
              enterKeyHint="next"
              placeholder="tu@correo.com"
              required
              aria-invalid={touched.email && Boolean(fieldErrors.email) ? 'true' : 'false'}
              aria-describedby={touched.email && fieldErrors.email ? 'auth-email-error' : undefined}
              className={
                touched.email
                  ? fieldErrors.email
                    ? 'input-mismatch'
                    : 'input-confirmed'
                  : ''
              }
              value={form.email}
              onChange={e => updateField('email', e.target.value, e.currentTarget)}
              onBlur={() => markTouched('email')}
            />
            {touched.email && fieldErrors.email && (
              <div id="auth-email-error" className="auth-field-feedback error">
                <span role="img" aria-label="Error">
                  ✕
                </span>{' '}
                {fieldErrors.email}
              </div>
            )}
          </div>

          <div className="auth-field">
            <div className="form-field-head">
              <label htmlFor="auth-password">
                Contraseña <span className="required-mark">*</span>
              </label>
              {register ? (
                <button
                  type="button"
                  className={`password-info-trigger ${allPasswordRulesMet ? 'all-met' : ''}`}
                  aria-expanded={showRulesHelp}
                  aria-controls="auth-password-rules"
                  onClick={() => setShowRulesHelp(prev => !prev)}
                  title="Ver requisitos de seguridad de la contraseña"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>
                    Requisitos ({metRulesCount}/{passwordRules.length})
                  </span>
                </button>
              ) : (
                <small className="field-hint">Mín. 8 caracteres</small>
              )}
            </div>
            <div className="password-input-wrap">
              <input
                id="auth-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={register ? 'new-password' : 'current-password'}
                enterKeyHint={register ? 'next' : 'done'}
                placeholder={
                  register
                    ? 'Ej. MiBurger.2026*'
                    : 'Mínimo 8 caracteres'
                }
                required
                minLength={8}
                aria-invalid={touched.password && Boolean(fieldErrors.password) ? 'true' : 'false'}
                aria-describedby={
                  [
                    register ? 'auth-password-rules' : null,
                    touched.password && fieldErrors.password ? 'auth-password-error' : null
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                className={
                  touched.password || (register && form.password.length > 0)
                    ? fieldErrors.password
                      ? touched.password
                        ? 'input-mismatch'
                        : ''
                      : 'input-confirmed'
                    : ''
                }
                value={form.password}
                onChange={e => updateField('password', e.target.value, e.currentTarget)}
                onFocus={() => {
                  if (register) setShowRulesHelp(true);
                }}
                onBlur={() => markTouched('password')}
              />
              <button
                type="button"
                className="password-toggle-btn"
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-describedby="password-toggle-warning"
                title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPassword(v => !v)}
              >
                <EyeIcon open={showPassword} />
                <span>{showPassword ? 'Ocultar' : 'Ver'}</span>
              </button>
            </div>

            {register && (
              <div
                id="auth-password-rules"
                className={`password-rules-box ${allPasswordRulesMet ? 'all-met' : ''} ${showRulesHelp ? 'open' : 'collapsed'}`}
                role="region"
                aria-label="Requisitos de la contraseña"
              >
                <div className="password-rules-head">
                  <span className="password-rules-title">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    <span>
                      {allPasswordRulesMet
                        ? '¡Contraseña segura! Todos los requisitos cumplidos'
                        : 'Tu contraseña debe cumplir estas 4 reglas:'}
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
            )}

            {touched.password && fieldErrors.password && (
              <div id="auth-password-error" className="auth-field-feedback error">
                <span role="img" aria-label="Error">
                  ✕
                </span>{' '}
                {fieldErrors.password}
              </div>
            )}
          </div>

          {register && (
            <div className="auth-field">
              <div className="form-field-head">
                <label htmlFor="auth-confirm-password">
                  Confirmar contraseña <span className="required-mark">*</span>
                </label>
                <small className="field-hint">Debe coincidir</small>
              </div>
              <div className="password-input-wrap">
                <input
                  id="auth-confirm-password"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  enterKeyHint="done"
                  placeholder="Repite tu contraseña"
                  required
                  minLength={8}
                  aria-invalid={passwordMismatch ? 'true' : 'false'}
                  aria-describedby={
                    passwordMismatch
                      ? 'confirm-password-error'
                      : passwordConfirmed
                        ? 'confirm-password-ok'
                        : undefined
                  }
                  className={
                    passwordMismatch
                      ? 'input-mismatch'
                      : passwordConfirmed
                        ? 'input-confirmed'
                        : ''
                  }
                  value={form.confirmPassword}
                  onChange={e => updateField('confirmPassword', e.target.value, e.currentTarget)}
                  onBlur={() => markTouched('confirmPassword')}
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
                  aria-describedby="password-toggle-warning"
                  title={
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
                <div id="confirm-password-error" className="auth-field-feedback error">
                  <span role="img" aria-label="Error">
                    ✕
                  </span>{' '}
                  {fieldErrors.confirmPassword}
                </div>
              )}
              {!passwordMismatch && passwordConfirmed && (
                <div id="confirm-password-ok" className="auth-field-feedback success">
                  <span aria-hidden="true">✓</span> Las contraseñas coinciden.
                </div>
              )}
            </div>
          )}

          <AlertBanner
            type="error"
            title={register ? 'No fue posible crear la cuenta' : 'No fue posible iniciar sesión'}
            message={status.error}
            onClose={() => setStatus(s => ({ ...s, error: '' }))}
          />

          {!isFormValid && (
            <p className="form-required-hint" role="status">
              Completa todos los campos obligatorios (<span className="required-mark">*</span>) para habilitar el botón.
            </p>
          )}

          <button
            type="submit"
            className="button full"
            disabled={status.loading || !isFormValid}
            title={
              !isFormValid
                ? 'Diligencia todos los campos obligatorios para continuar'
                : undefined
            }
          >
            {status.loading ? (
              <>
                <Spinner size="sm" label="Procesando autenticación…" />
                <span>Procesando…</span>
              </>
            ) : register ? (
              'Crear cuenta'
            ) : (
              'Ingresar'
            )}
          </button>
        </form>
        <button type="button" className="switch-auth" onClick={toggleAuthMode}>
          {register ? '¿Ya tienes cuenta? Inicia sesión' : '¿Nuevo en Secret Bite? Quiero registrarme'}
        </button>
      </section>
    </main>
  );
}

function BurgerCard({ burger, campaign, user, onVote, busy, votingBurgerId, isLeader, totalVotes }) {
  const [quantity, setQuantity] = useState(1);
  const voted = campaign.userVoteBurgerId === burger.id;
  const locked = Boolean(campaign.userVoteBurgerId);
  const isVotingThis = busy && votingBurgerId === burger.id;
  const share = totalVotes > 0 ? Math.round((burger.voteCount / totalVotes) * 100) : 0;
  const desiredCount = burger.desiredQuantity ?? burger.voteCount ?? 0;
  const unitPrice = burger.priceCop || 28000;
  const ingredientList = burger.ingredients
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

  function updateQuantity(nextValue) {
    const parsed = Math.min(50, Math.max(1, Number.parseInt(nextValue, 10) || 1));
    setQuantity(parsed);
  }

  return (
    <article className={`burger-card ${voted ? 'selected' : ''} ${isLeader ? 'leader' : ''}`}>
      <div className="image-wrap">
        <img src={burger.imageUrl || '/assets/hero-burger.jpeg'} alt={`Hamburguesa ${burger.name}`} loading="lazy" />
        {isLeader && <span className="leader-ribbon">★ Líder actual</span>}
        <span className="vote-badge">
          {burger.voteCount} {burger.voteCount === 1 ? 'voto' : 'votos'} · {desiredCount} uds. · {share}%
        </span>
      </div>
      <div className="burger-content">
        <div className="flex items-start justify-between gap-2">
          <h3>{burger.name}</h3>
          <span className="font-mono text-xs font-bold text-brand-amber shrink-0">
            {formatCop(unitPrice)}
          </span>
        </div>
        <p>{burger.description}</p>
        <ul className="ingredient-pills" aria-label="Ingredientes">
          {ingredientList.map(ingredient => (
            <li key={ingredient}>{ingredient}</li>
          ))}
        </ul>
        <div className="vote-meter" aria-hidden="true">
          <span style={{ inlineSize: `${Math.max(share, burger.voteCount > 0 ? 8 : 0)}%` }} />
        </div>

        {user && !locked ? (
          <div className="vote-quantity-box">
            <div className="vote-quantity-head">
              <label htmlFor={`vote-qty-${burger.id}`}>¿Cuántas deseas pedir?</label>
              <span className="vote-quantity-subtotal">{formatCop(unitPrice * quantity)}</span>
            </div>
            <div className="vote-quantity-controls">
              <div className="vote-stepper" role="group" aria-label={`Cantidad deseada de ${burger.name}`}>
                <button
                  type="button"
                  className="vote-stepper-btn"
                  disabled={busy || quantity <= 1}
                  onClick={() => updateQuantity(quantity - 1)}
                  aria-label="Disminuir cantidad"
                >
                  −
                </button>
                <input
                  id={`vote-qty-${burger.id}`}
                  name={`voteQty-${burger.id}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  disabled={busy}
                  value={quantity}
                  onChange={e => updateQuantity(e.target.value)}
                />
                <button
                  type="button"
                  className="vote-stepper-btn"
                  disabled={busy || quantity >= 50}
                  onClick={() => updateQuantity(quantity + 1)}
                  aria-label="Aumentar cantidad"
                >
                  +
                </button>
              </div>
              <div className="vote-qty-presets" role="group" aria-label="Cantidades rápidas">
                {[1, 2, 4, 6].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    className={`vote-qty-chip ${quantity === preset ? 'active' : ''}`}
                    disabled={busy}
                    onClick={() => setQuantity(preset)}
                  >
                    {preset}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          user &&
          voted && (
            <div className="vote-registered-summary" role="status">
              <span>Cantidad registrada en tu voto:</span>
              <strong>
                {campaign.userVoteQuantity || 1}{' '}
                {(campaign.userVoteQuantity || 1) === 1 ? 'hamburguesa' : 'hamburguesas'}
              </strong>
            </div>
          )
        )}

        <button
          className={`button full ${voted ? 'voted' : ''}`}
          disabled={locked || busy}
          onClick={() => onVote(burger.id, quantity)}
        >
          {isVotingThis ? (
            <>
              <Spinner size="sm" label={`Registrando voto por ${burger.name}`} />
              <span>Registrando voto…</span>
            </>
          ) : voted ? (
            `✓ Elegida (${campaign.userVoteQuantity || 1} ${(campaign.userVoteQuantity || 1) === 1 ? 'ud.' : 'uds.'})`
          ) : locked ? (
            'Voto ya emitido'
          ) : user ? (
            `Votar y reservar ${quantity} ${quantity === 1 ? 'burger' : 'burgers'}`
          ) : (
            'Ingresa para votar'
          )}
        </button>
      </div>
    </article>
  );
}

function Home({ user, onNeedAuth, onOrderClick }) {
  const [campaign, setCampaign] = useState(null);
  const [status, setStatus] = useState({
    loading: true,
    error: '',
    message: '',
    busy: false,
    votingBurgerId: null
  });
  const countdown = useCountdown(campaign?.endsAt);
  const { notify } = useToast();

  const load = useCallback(async () => {
    try {
      const data = await api('/campaigns/active');
      setCampaign(data.campaign);
      setStatus(s => ({ ...s, loading: false, error: '' }));
    } catch (error) {
      setStatus(s => ({ ...s, loading: false, error: error.message }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, user?.id]);

  async function vote(burgerId, quantity = 1) {
    if (!user) return onNeedAuth();
    const safeQuantity = Math.min(50, Math.max(1, Number.parseInt(quantity, 10) || 1));
    setStatus(s => ({ ...s, busy: true, votingBurgerId: burgerId, error: '', message: '' }));
    try {
      const data = await api(`/campaigns/${campaign.id}/votes`, {
        method: 'POST',
        body: JSON.stringify({ burgerId, quantity: safeQuantity })
      });
      setCampaign(data.campaign);
      setStatus({ loading: false, busy: false, votingBurgerId: null, error: '', message: data.message });
      notify({
        type: 'success',
        title: 'Voto verificado',
        message: data.message
      });
    } catch (error) {
      setStatus(s => ({ ...s, busy: false, votingBurgerId: null, error: error.message }));
      notify({
        type: 'error',
        title: 'No se pudo registrar el voto',
        message: error.message
      });
    }
  }

  const visibleCandidates = useMemo(
    () => (campaign?.candidates || []).filter(item => item.active !== false && !item.deleted),
    [campaign]
  );

  const totalVotes = useMemo(
    () => visibleCandidates.reduce((sum, item) => sum + item.voteCount, 0),
    [visibleCandidates]
  );

  const totalDesired = useMemo(
    () => visibleCandidates.reduce((sum, item) => sum + (item.desiredQuantity ?? item.voteCount ?? 0), 0),
    [visibleCandidates]
  );

  const leader = useMemo(
    () => visibleCandidates.toSorted((a, b) => b.voteCount - a.voteCount)[0],
    [visibleCandidates]
  );

  return (
    <main>
      <section className="hero" id="inicio">
        <div className="hero-copy">
          <span className="eyebrow">LA DECISIÓN ESTÁ EN TUS MANOS</span>
          <h1>
            El próximo clásico
            <br />
            lo elige <em>Medellín.</em>
          </h1>
          <p>
            Explora las recetas candidatas de autor y usa tu único voto. La más votada entra a la parrilla como la
            hamburguesa oficial del próximo mes.
          </p>
          <div className="hero-actions">
            <a className="button" href="#candidatas">
              Ver candidatas
            </a>
            {user?.role === 'CLIENT' && (
              <button className="button ghost" onClick={onOrderClick}>
                Pedir a domicilio
              </button>
            )}
            <span className="hero-meta">
              Votación verificada
              <br />
              <b>
                1 persona · 1 voto · {totalVotes} votos ({totalDesired} uds. deseadas)
              </b>
            </span>
          </div>
        </div>
        <div className="hero-photo">
          <img src="/assets/hero-burger.jpeg" alt="Hamburguesa Secret Bite servida con papas" />
          <div className="floating-card">
            <span className="pulse-dot" aria-hidden="true" />
            <div>
              <small>Líder provisional</small>
              <strong>{leader?.name || 'Aún por definir'}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="campaign-section" id="candidatas">
        <div className="section-heading">
          <div>
            <span className="eyebrow">CAMPAÑA ACTIVA</span>
            <h2>{campaign?.name || 'La próxima favorita'}</h2>
          </div>
          {campaign && (
            <div className="countdown" aria-live="polite" aria-label={`La votación cierra en ${countdown.label}`}>
              <small>La votación cierra en</small>
              <div className="countdown-segments">
                <span>
                  <strong>{countdown.parts.days}</strong>
                  <em>días</em>
                </span>
                <span>
                  <strong>{String(countdown.parts.hours).padStart(2, '0')}</strong>
                  <em>hrs</em>
                </span>
                <span>
                  <strong>{String(countdown.parts.minutes).padStart(2, '0')}</strong>
                  <em>min</em>
                </span>
                <span>
                  <strong>{String(countdown.parts.seconds).padStart(2, '0')}</strong>
                  <em>seg</em>
                </span>
              </div>
            </div>
          )}
        </div>

        <AlertBanner
          type="success"
          title="Voto registrado"
          message={status.message}
          onClose={() => setStatus(s => ({ ...s, message: '' }))}
        />
        <AlertBanner
          type="error"
          title="No fue posible procesar la votación"
          message={status.error}
          onClose={() => setStatus(s => ({ ...s, error: '' }))}
        />

        {status.loading ? (
          <LoaderCard
            title="Cargando campaña activa…"
            subtitle="Consultando candidatas participantes y escrutinio en tiempo real."
          />
        ) : (
          campaign && (
            <>
              <div className="burger-grid">
                {visibleCandidates.map(burger => (
                  <BurgerCard
                    key={burger.id}
                    burger={burger}
                    campaign={campaign}
                    user={user}
                    onVote={vote}
                    busy={status.busy}
                    votingBurgerId={status.votingBurgerId}
                    isLeader={leader?.id === burger.id && burger.voteCount > 0}
                    totalVotes={totalVotes}
                  />
                ))}
              </div>
              <p className="campaign-note">
                Resultados provisionales visibles en tiempo real. El voto es definitivo y no puede modificarse después
                de ser emitido.
              </p>
            </>
          )
        )}
      </section>

      <section className="how">
        <span className="eyebrow">CÓMO FUNCIONA</span>
        <h2>Tres pasos. Una ganadora.</h2>
        <div>
          <article>
            <b>01</b>
            <h3>Conoce las recetas</h3>
            <p>Revisa los cortes, quesos madurados, salsas de autor y pan artesanal de cada candidata.</p>
          </article>
          <article>
            <b>02</b>
            <h3>Emite tu voto único</h3>
            <p>Inicia sesión con tu cuenta del club y respalda a tu favorita antes del cierre del cronómetro.</p>
          </article>
          <article>
            <b>03</b>
            <h3>Pruébala en el menú</h3>
            <p>Al cerrar la campaña, la receta ganadora encabeza los pedidos del mes en Medellín.</p>
          </article>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      navigate('/auth', { replace: true });
    };
    window.addEventListener('secret-bite:session-expired', onExpired);
    return () => window.removeEventListener('secret-bite:session-expired', onExpired);
  }, [navigate]);

  useEffect(() => {
    if (!hasSessionTokens()) return setLoading(false);
    api('/auth/me')
      .then(data => setUser(data.user))
      .catch(() => clearSessionTokens())
      .finally(() => setLoading(false));
  }, []);

  function onAuth(data) {
    saveSessionTokens(data);
    setUser(data.user);
    if (data.user.role === 'ADMIN') {
      navigate('/admin/dashboard');
    } else if (data.user.role === 'CHEF') {
      navigate('/admin/cocina');
    } else {
      navigate('/');
    }
  }

  function logout() {
    logoutSession();
    setUser(null);
    navigate('/');
  }

  if (loading) {
    return (
      <div className="splash">
        <div className="splash-inner">
          <span className="brand-mark splash-mark">SB</span>
          <Spinner size="lg" label="Iniciando Secret Bite Medellín…" />
          <small>Preparando parrilla y urna digital…</small>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      {!isAdmin && <Header user={user} logout={logout} />}
      <Routes>
        <Route
          path="/"
          element={
            <Home
              user={user}
              onNeedAuth={() => navigate('/auth')}
              onOrderClick={() => navigate('/pedidos')}
            />
          }
        />
        <Route
          path="/auth"
          element={<Auth onAuth={onAuth} goHome={() => navigate('/')} />}
        />
        <Route
          path="/pedidos"
          element={user?.role === 'CLIENT' ? <Orders /> : <Navigate to="/" replace />}
        />
        <Route
          path="/seguridad"
          element={user ? <ChangePassword user={user} /> : <Navigate to="/auth" replace />}
        />
        <Route
          path="/cocina"
          element={
            ['CHEF', 'ADMIN'].includes(user?.role) ? (
              <Navigate to="/admin/cocina" replace />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/admin/*"
          element={
            ['ADMIN', 'CHEF'].includes(user?.role) ? (
              <AdminLayout user={user} logout={logout} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!isAdmin && (
        <footer>
          <span className="brand-mark">SB</span>
          <p>
            <b>Secret Bite Medellín</b>
            <br />
            La próxima burger la elige la comunidad.
          </p>
          <small>© {new Date().getFullYear()} · Plataforma de votación y pedidos</small>
        </footer>
      )}
    </ToastProvider>
  );
}
