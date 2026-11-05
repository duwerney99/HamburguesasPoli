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
import Kitchen from './features/Kitchen.jsx';
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
      <nav aria-label="Navegación principal">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          Votación
        </NavLink>
        {user?.role === 'CLIENT' && (
          <NavLink to="/pedidos" className={({ isActive }) => (isActive ? 'active' : '')}>
            Pedidos
          </NavLink>
        )}
        {['CHEF', 'ADMIN'].includes(user?.role) && (
          <NavLink to="/cocina" className={({ isActive }) => (isActive ? 'active' : '')}>
            Cocina
          </NavLink>
        )}
        {user?.role === 'ADMIN' && (
          <NavLink
            to={isAdmin ? location.pathname : '/admin/dashboard'}
            className={() => (isAdmin ? 'active' : '')}
          >
            Panel admin
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

function Auth({ onAuth, goHome }) {
  const [register, setRegister] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [status, setStatus] = useState({ loading: false, error: '' });
  const { notify } = useToast();

  async function submit(event) {
    event.preventDefault();
    setStatus({ loading: true, error: '' });
    try {
      const data = await api(`/auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(form)
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
        <button className="back-link" onClick={goHome}>
          ← Volver a la campaña
        </button>
        <h2>{register ? 'Crea tu cuenta' : 'Bienvenido de vuelta'}</h2>
        <p>{register ? 'Únete y participa en la campaña activa.' : 'Ingresa para emitir o consultar tu voto.'}</p>
        <form onSubmit={submit}>
          {register && (
            <label>
              Nombre completo
              <input
                autoComplete="name"
                placeholder="Ej. Camila Restrepo"
                required
                minLength="2"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </label>
          )}
          <label>
            Correo electrónico
            <input
              type="email"
              autoComplete="email"
              placeholder="tu@correo.com"
              required
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              placeholder="Mínimo 8 caracteres"
              required
              minLength="8"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <AlertBanner
            type="error"
            title="No fue posible iniciar sesión"
            message={status.error}
            onClose={() => setStatus(s => ({ ...s, error: '' }))}
          />
          <button className="button full" disabled={status.loading}>
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
        <button
          className="switch-auth"
          onClick={() => {
            setRegister(!register);
            setStatus({ loading: false, error: '' });
          }}
        >
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
      navigate('/cocina');
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
      <Header user={user} logout={logout} />
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
          path="/cocina"
          element={
            ['CHEF', 'ADMIN'].includes(user?.role) ? <Kitchen /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/admin/*"
          element={user?.role === 'ADMIN' ? <AdminLayout /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <footer>
        <span className="brand-mark">SB</span>
        <p>
          <b>Secret Bite Medellín</b>
          <br />
          La próxima burger la elige la comunidad.
        </p>
        <small>© {new Date().getFullYear()} · Plataforma de votación y pedidos</small>
      </footer>
    </ToastProvider>
  );
}
