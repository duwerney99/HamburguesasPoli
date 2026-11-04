import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import Orders from './features/Orders.jsx';
import Kitchen from './features/Kitchen.jsx';
import AdminExtras from './features/AdminExtras.jsx';

function useCountdown(endsAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const remaining = Math.max(0, Date.parse(endsAt || 0) - now);
  const parts = { days: Math.floor(remaining / 86400000), hours: Math.floor(remaining / 3600000) % 24, minutes: Math.floor(remaining / 60000) % 60, seconds: Math.floor(remaining / 1000) % 60 };
  return { remaining, label: `${parts.days}d ${String(parts.hours).padStart(2, '0')}h ${String(parts.minutes).padStart(2, '0')}m ${String(parts.seconds).padStart(2, '0')}s` };
}

function Header({ user, view, setView, logout }) {
  return <header className="site-header"><a className="brand" href="#inicio" onClick={() => setView('home')} aria-label="Secret Bite, inicio"><span className="brand-mark">SB</span><span>Secret <b>Bite</b><small>Medellín · Burger club</small></span></a>
    <nav aria-label="Navegación principal"><button className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}>Votación</button>{user?.role === 'CLIENT' && <button className={view === 'orders' ? 'active' : ''} onClick={() => setView('orders')}>Pedidos</button>}{['CHEF', 'ADMIN'].includes(user?.role) && <button className={view === 'kitchen' ? 'active' : ''} onClick={() => setView('kitchen')}>Cocina</button>}{user?.role === 'ADMIN' && <button className={view === 'admin' ? 'active' : ''} onClick={() => setView('admin')}>Panel admin</button>}</nav>
    <div className="session">{user ? <><span className="user-name">Hola, {user.name.split(' ')[0]}</span><button className="button ghost" onClick={logout}>Salir</button></> : <button className="button small" onClick={() => setView('auth')}>Ingresar</button>}</div>
  </header>;
}

function Auth({ onAuth, goHome }) {
  const [register, setRegister] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [status, setStatus] = useState({ loading: false, error: '' });
  async function submit(event) {
    event.preventDefault(); setStatus({ loading: true, error: '' });
    try {
      const data = await api(`/auth/${register ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(form) });
      onAuth(data);
    } catch (error) { setStatus({ loading: false, error: error.message }); }
  }
  return <main className="auth-page"><section className="auth-copy"><span className="eyebrow">ACCESO A LA COMUNIDAD</span><h1>Tu voto cambia<br /><em>el próximo menú.</em></h1><p>Una cuenta, un voto, una burger ganadora. Sin puntos, compras ni pasos innecesarios.</p><img src="/assets/secret-bite-mark.jpeg" alt="Ilustración del agente secreto de Secret Bite" /></section>
    <section className="auth-card"><button className="back-link" onClick={goHome}>← Volver</button><h2>{register ? 'Crea tu cuenta' : 'Bienvenido de vuelta'}</h2><p>{register ? 'Únete y participa en la campaña activa.' : 'Ingresa para emitir o consultar tu voto.'}</p>
      <form onSubmit={submit}>{register && <label>Nombre completo<input autoComplete="name" required minLength="2" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>}<label>Correo electrónico<input type="email" autoComplete="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label><label>Contraseña<input type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength="8" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>
        {status.error && <div className="alert error" role="alert">{status.error}</div>}<button className="button full" disabled={status.loading}>{status.loading ? 'Procesando…' : register ? 'Crear cuenta' : 'Ingresar'}</button></form>
      <button className="switch-auth" onClick={() => { setRegister(!register); setStatus({ loading: false, error: '' }); }}>{register ? 'Ya tengo cuenta' : 'Quiero registrarme'}</button></section></main>;
}

function BurgerCard({ burger, campaign, user, onVote, busy }) {
  const voted = campaign.userVoteBurgerId === burger.id;
  const locked = Boolean(campaign.userVoteBurgerId);
  return <article className={`burger-card ${voted ? 'selected' : ''}`}><div className="image-wrap"><img src={burger.imageUrl || '/assets/hero-burger.jpeg'} alt={`Hamburguesa ${burger.name}`} loading="lazy" /><span className="vote-badge">{burger.voteCount} {burger.voteCount === 1 ? 'voto' : 'votos'}</span></div><div className="burger-content"><h3>{burger.name}</h3><p>{burger.description}</p><small>{burger.ingredients}</small><button className="button full" disabled={locked || busy} onClick={() => onVote(burger.id)}>{voted ? '✓ Tu elección' : locked ? 'Voto ya emitido' : user ? 'Votar por esta burger' : 'Ingresa para votar'}</button></div></article>;
}

function Home({ user, onNeedAuth }) {
  const [campaign, setCampaign] = useState(null);
  const [status, setStatus] = useState({ loading: true, error: '', message: '', busy: false });
  const countdown = useCountdown(campaign?.endsAt);
  const load = useCallback(async () => { try { const data = await api('/campaigns/active'); setCampaign(data.campaign); setStatus(s => ({ ...s, loading: false, error: '' })); } catch (error) { setStatus(s => ({ ...s, loading: false, error: error.message })); } }, []);
  useEffect(() => { load(); }, [load, user]);
  async function vote(burgerId) {
    if (!user) return onNeedAuth();
    setStatus(s => ({ ...s, busy: true, error: '', message: '' }));
    try { const data = await api(`/campaigns/${campaign.id}/votes`, { method: 'POST', body: JSON.stringify({ burgerId }) }); setCampaign(data.campaign); setStatus({ loading: false, busy: false, error: '', message: data.message }); }
    catch (error) { setStatus(s => ({ ...s, busy: false, error: error.message })); }
  }
  const leader = useMemo(() => campaign?.candidates?.toSorted((a, b) => b.voteCount - a.voteCount)[0], [campaign]);
  return <main><section className="hero" id="inicio"><div className="hero-copy"><span className="eyebrow">LA DECISIÓN ESTÁ EN TUS MANOS</span><h1>El próximo clásico<br />lo elige <em>Medellín.</em></h1><p>Explora las recetas candidatas y usa tu único voto. La más votada se convierte en la hamburguesa del próximo mes.</p><div className="hero-actions"><a className="button" href="#candidatas">Ver candidatas</a><span>Votación transparente<br /><b>1 persona · 1 voto</b></span></div></div><div className="hero-photo"><img src="/assets/hero-burger.jpeg" alt="Hamburguesa Secret Bite servida con papas" /><div className="floating-card"><small>Líder provisional</small><strong>{leader?.name || 'Aún por definir'}</strong></div></div></section>
    <section className="campaign-section" id="candidatas"><div className="section-heading"><div><span className="eyebrow">CAMPAÑA ACTIVA</span><h2>{campaign?.name || 'La próxima favorita'}</h2></div>{campaign && <div className="countdown" aria-live="polite"><small>La votación cierra en</small><strong>{countdown.label}</strong></div>}</div>
      {status.message && <div className="alert success" role="status">{status.message}</div>}{status.error && <div className="alert error" role="alert">{status.error}</div>}{status.loading ? <div className="loading">Cargando campaña…</div> : campaign && <><div className="burger-grid">{campaign.candidates.map(burger => <BurgerCard key={burger.id} burger={burger} campaign={campaign} user={user} onVote={vote} busy={status.busy} />)}</div><p className="campaign-note">Resultados provisionales visibles en tiempo real. El voto no puede cambiarse después de ser emitido.</p></>}</section>
    <section className="how"><span className="eyebrow">CÓMO FUNCIONA</span><h2>Tres pasos. Una ganadora.</h2><div><article><b>01</b><h3>Conoce las recetas</h3><p>Revisa ingredientes y propuestas de la campaña.</p></article><article><b>02</b><h3>Emite tu voto</h3><p>Regístrate y elige una sola candidata.</p></article><article><b>03</b><h3>Descubre la ganadora</h3><p>Al cerrar la campaña, la más votada lidera el menú.</p></article></div></section></main>;
}

function BurgerForm({ onSaved }) {
  const initial = { name: '', description: '', ingredients: '', imageUrl: '/assets/hero-burger.jpeg', priceCop: 28000, active: true };
  const [form, setForm] = useState(initial); const [error, setError] = useState('');
  async function submit(e) { e.preventDefault(); try { await api('/burgers', { method: 'POST', body: JSON.stringify(form) }); setForm(initial); setError(''); onSaved('Hamburguesa creada.'); } catch (err) { setError(err.message); } }
  return <form className="admin-form" onSubmit={submit}><h3>Nueva hamburguesa</h3><label>Nombre<input required minLength="2" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label>Descripción<textarea required minLength="10" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label><label>Ingredientes separados por coma<textarea required value={form.ingredients} onChange={e => setForm({ ...form, ingredients: e.target.value })} /></label><label>Precio COP<input type="number" min="1000" required value={form.priceCop} onChange={e => setForm({ ...form, priceCop: Number(e.target.value) })} /></label><label>Ruta de imagen<input required value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} /></label>{error && <div className="alert error">{error}</div>}<button className="button">Guardar hamburguesa</button></form>;
}

function CampaignForm({ burgers, onSaved }) {
  const tomorrow = new Date(Date.now() + 86400000); const nextMonth = new Date(Date.now() + 15 * 86400000);
  const [form, setForm] = useState({ name: 'Burger del próximo mes', startsAt: new Date().toISOString().slice(0, 16), endsAt: nextMonth.toISOString().slice(0, 16), status: 'DRAFT', burgerIds: [] }); const [error, setError] = useState('');
  function toggle(id) { setForm(f => ({ ...f, burgerIds: f.burgerIds.includes(id) ? f.burgerIds.filter(item => item !== id) : [...f.burgerIds, id] })); }
  async function submit(e) { e.preventDefault(); try { await api('/campaigns', { method: 'POST', body: JSON.stringify({ ...form, startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString() }) }); setError(''); onSaved('Campaña creada.'); } catch (err) { setError(err.message); } }
  return <form className="admin-form" onSubmit={submit}><h3>Nueva campaña</h3><label>Nombre<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><div className="form-row"><label>Inicio<input type="datetime-local" required value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} /></label><label>Cierre<input type="datetime-local" required value={form.endsAt} min={tomorrow.toISOString().slice(0, 16)} onChange={e => setForm({ ...form, endsAt: e.target.value })} /></label></div><label>Estado<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="DRAFT">Borrador</option><option value="PUBLISHED">Publicada</option></select></label><fieldset><legend>Candidatas (mínimo 2)</legend>{burgers.filter(b => b.active).map(b => <label className="check" key={b.id}><input type="checkbox" checked={form.burgerIds.includes(b.id)} onChange={() => toggle(b.id)} />{b.name}</label>)}</fieldset>{error && <div className="alert error">{error}</div>}<button className="button">Guardar campaña</button></form>;
}

function Admin() {
  const [data, setData] = useState({ burgers: [], stats: null }); const [status, setStatus] = useState({ loading: true, error: '', message: '' });
  const load = useCallback(async () => { try { const [burgerData, statsData] = await Promise.all([api('/burgers'), api('/admin/stats')]); setData({ burgers: burgerData.burgers, stats: statsData }); setStatus(s => ({ ...s, loading: false, error: '' })); } catch (error) { setStatus({ loading: false, error: error.message, message: '' }); } }, []);
  useEffect(() => { load(); }, [load]);
  async function deactivate(burger) { try { await api(`/burgers/${burger.id}`, { method: 'PUT', body: JSON.stringify({ ...burger, active: !burger.active }) }); await load(); } catch (error) { setStatus(s => ({ ...s, error: error.message })); } }
  async function closeCampaign(id) { try { await api(`/campaigns/${id}/close`, { method: 'POST' }); await load(); } catch (error) { setStatus(s => ({ ...s, error: error.message })); } }
  const saved = message => { setStatus(s => ({ ...s, message })); load(); };
  if (status.loading) return <main className="admin-page"><div className="loading">Cargando panel…</div></main>;
  return <main className="admin-page"><div className="admin-title"><div><span className="eyebrow">BACKOFFICE</span><h1>Centro de control</h1><p>Catálogo, campañas y votos en un solo lugar.</p></div><button className="button ghost" onClick={load}>Actualizar datos</button></div>{status.error && <div className="alert error">{status.error}</div>}{status.message && <div className="alert success">{status.message}</div>}
    {data.stats && <section className="stats-grid">{Object.entries({ Clientes: data.stats.totals.users, Hamburguesas: data.stats.totals.burgers, Campañas: data.stats.totals.campaigns, Votos: data.stats.totals.votes, Pedidos: data.stats.totals.orders }).map(([label, value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}</section>}
    <section className="admin-grid"><BurgerForm onSaved={saved} /><CampaignForm burgers={data.burgers} onSaved={saved} /></section>
    <section className="admin-list"><div className="section-heading"><div><span className="eyebrow">CATÁLOGO</span><h2>Hamburguesas</h2></div></div><div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Ingredientes</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{data.burgers.map(b => <tr key={b.id}><td><strong>{b.name}</strong></td><td>{b.ingredients}</td><td><span className={`status ${b.active ? 'on' : 'off'}`}>{b.active ? 'Activa' : 'Inactiva'}</span></td><td><button className="text-button" onClick={() => deactivate(b)}>{b.active ? 'Desactivar' : 'Activar'}</button></td></tr>)}</tbody></table></div></section>
    <section className="admin-list"><div className="section-heading"><div><span className="eyebrow">RESULTADOS</span><h2>Campañas</h2></div></div>{data.stats?.campaigns.map(c => <article className="campaign-admin" key={c.id}><div><strong>{c.name}</strong><span className={`status ${c.status === 'ACTIVE' ? 'on' : 'off'}`}>{c.status}</span></div><small>{new Date(c.startsAt).toLocaleDateString('es-CO')} — {new Date(c.endsAt).toLocaleDateString('es-CO')}</small><div className="result-bars">{c.candidates.map(candidate => { const max = Math.max(1, ...c.candidates.map(x => x.voteCount)); return <div key={candidate.id}><span>{candidate.name}<b>{candidate.voteCount}</b></span><i><em style={{ width: `${candidate.voteCount / max * 100}%` }} /></i></div>; })}</div>{c.lifecycleStatus === 'PUBLISHED' && <button className="button small" onClick={() => closeCampaign(c.id)}>Cerrar y elegir ganadora</button>}</article>)}</section><AdminExtras /></main>;
}

export default function App() {
  const [user, setUser] = useState(null); const [view, setView] = useState('home'); const [loading, setLoading] = useState(true);
  useEffect(() => { if (!localStorage.getItem('secret-bite-token')) return setLoading(false); api('/auth/me').then(data => setUser(data.user)).catch(() => localStorage.removeItem('secret-bite-token')).finally(() => setLoading(false)); }, []);
  function onAuth(data) { localStorage.setItem('secret-bite-token', data.token); setUser(data.user); setView(data.user.role === 'ADMIN' ? 'admin' : data.user.role === 'CHEF' ? 'kitchen' : 'home'); }
  function logout() { localStorage.removeItem('secret-bite-token'); setUser(null); setView('home'); }
  if (loading) return <div className="splash">SB</div>;
  return <><Header user={user} view={view} setView={setView} logout={logout} />{view === 'auth' ? <Auth onAuth={onAuth} goHome={() => setView('home')} /> : view === 'admin' && user?.role === 'ADMIN' ? <Admin /> : view === 'orders' && user?.role === 'CLIENT' ? <Orders /> : view === 'kitchen' && ['CHEF', 'ADMIN'].includes(user?.role) ? <Kitchen /> : <Home user={user} onNeedAuth={() => setView('auth')} />}<footer><span className="brand-mark">SB</span><p><b>Secret Bite Medellín</b><br />La próxima burger la elige la comunidad.</p><small>© {new Date().getFullYear()} · Plataforma de votación y pedidos</small></footer></>;
}
