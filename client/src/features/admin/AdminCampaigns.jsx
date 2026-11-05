import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { AlertBanner, LoaderCard, Spinner, useToast } from '../../ui/Feedback.jsx';
import { formatCop } from './adminShared.jsx';

export function CampaignForm({ burgers, editingCampaign, onCancelEdit, onSaved }) {
  const tomorrow = new Date(Date.now() + 86400000);
  const defaultEnd = new Date(Date.now() + 15 * 86400000);
  const buildInitial = useCallback(
    () => ({
      name: 'Burger del próximo mes',
      startsAt: new Date().toISOString().slice(0, 16),
      endsAt: defaultEnd.toISOString().slice(0, 16),
      status: 'DRAFT',
      burgerIds: []
    }),
    []
  );

  const [form, setForm] = useState(buildInitial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { notify } = useToast();

  useEffect(() => {
    if (editingCampaign) {
      setForm({
        name: editingCampaign.name,
        startsAt: new Date(editingCampaign.startsAt).toISOString().slice(0, 16),
        endsAt: new Date(editingCampaign.endsAt).toISOString().slice(0, 16),
        status: editingCampaign.lifecycleStatus === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
        burgerIds: editingCampaign.candidates.map(c => c.id)
      });
      setError('');
    } else {
      setForm(buildInitial());
    }
  }, [editingCampaign, buildInitial]);

  const activeBurgers = useMemo(() => burgers.filter(b => b.active), [burgers]);

  const durationDays = useMemo(() => {
    const diff = Date.parse(form.endsAt) - Date.parse(form.startsAt);
    return diff > 0 ? Math.max(1, Math.round(diff / 86400000)) : 0;
  }, [form.startsAt, form.endsAt]);

  function applyDurationPreset(days) {
    const startMs = Date.parse(form.startsAt) || Date.now();
    const nextEnd = new Date(startMs + days * 86400000).toISOString().slice(0, 16);
    setForm(f => ({ ...f, endsAt: nextEnd }));
  }

  function toggle(id) {
    setForm(f => {
      if (f.burgerIds.includes(id)) {
        return { ...f, burgerIds: f.burgerIds.filter(item => item !== id) };
      }
      if (f.burgerIds.length >= 8) return f;
      return { ...f, burgerIds: [...f.burgerIds, id] };
    });
  }

  function selectAllCandidates() {
    setForm(f => ({ ...f, burgerIds: activeBurgers.slice(0, 8).map(b => b.id) }));
  }

  function clearCandidates() {
    setForm(f => ({ ...f, burgerIds: [] }));
  }

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const endpoint = editingCampaign ? `/campaigns/${editingCampaign.id}` : '/campaigns';
      const method = editingCampaign ? 'PUT' : 'POST';
      await api(endpoint, {
        method,
        body: JSON.stringify({
          ...form,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString()
        })
      });
      if (!editingCampaign) setForm(buildInitial());
      onSaved(editingCampaign ? 'Ciclo de votación actualizado.' : 'Nueva campaña creada y programada.');
    } catch (err) {
      setError(err.message);
      notify({ type: 'error', title: 'No se pudo guardar el ciclo', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="admin-form campaign-studio-form" id="campaign-studio" method="post" onSubmit={submit}>
      <div className="admin-form-header">
        <div>
          <span className="eyebrow">CICLO DE VOTACIÓN</span>
          <h3>{editingCampaign ? `Editando: ${editingCampaign.name}` : 'Nueva campaña'}</h3>
        </div>
        <div className="campaign-studio-badges">
          {durationDays > 0 && <span className="duration-badge">{durationDays} días</span>}
          <span className={`selection-counter ${form.burgerIds.length >= 2 ? 'ready' : ''}`}>
            {form.burgerIds.length} / 2–8 candidatas
          </span>
        </div>
      </div>

      <label>
        Nombre de la campaña
        <input
          name="campaignName"
          required
          placeholder="Ej. Edición Especial Octubre"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
        />
      </label>

      <div className="form-row">
        <label>
          Apertura de urna
          <input
            name="startsAt"
            type="datetime-local"
            required
            value={form.startsAt}
            onChange={e => setForm({ ...form, startsAt: e.target.value })}
          />
        </label>
        <label>
          Cierre programado
          <input
            name="endsAt"
            type="datetime-local"
            required
            value={form.endsAt}
            min={tomorrow.toISOString().slice(0, 16)}
            onChange={e => setForm({ ...form, endsAt: e.target.value })}
          />
        </label>
      </div>

      <div className="preset-bar" role="group" aria-label="Duración rápida de campaña">
        <small>Duración rápida:</small>
        {[
          [7, '7 días'],
          [15, '15 días'],
          [30, '30 días']
        ].map(([days, label]) => (
          <button
            key={days}
            type="button"
            className={`preset-chip ${durationDays === days ? 'active' : ''}`}
            onClick={() => applyDurationPreset(days)}
          >
            {label}
          </button>
        ))}
      </div>

      <fieldset>
        <legend>Visibilidad del ciclo</legend>
        <div className="radio-pill-group">
          <label className="check">
            <input
              type="radio"
              name="campaignStatus"
              value="DRAFT"
              checked={form.status === 'DRAFT'}
              onChange={e => setForm({ ...form, status: e.target.value })}
            />
            <span>Borrador interno</span>
          </label>
          <label className="check">
            <input
              type="radio"
              name="campaignStatus"
              value="PUBLISHED"
              checked={form.status === 'PUBLISHED'}
              onChange={e => setForm({ ...form, status: e.target.value })}
            />
            <span>Publicada al club</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="candidate-picker-fieldset">
        <legend>
          <span>Candidatas participantes (mínimo 2, máximo 8)</span>
          <span className="picker-actions">
            <button type="button" className="text-button" onClick={selectAllCandidates}>
              Todas
            </button>
            <button type="button" className="text-button" onClick={clearCandidates}>
              Limpiar
            </button>
          </span>
        </legend>
        <div className="candidate-pick-grid">
          {activeBurgers.map(b => {
            const checked = form.burgerIds.includes(b.id);
            return (
              <label className="candidate-pick-card" key={b.id}>
                <input
                  type="checkbox"
                  name="candidateBurgers"
                  checked={checked}
                  onChange={() => toggle(b.id)}
                />
                <img src={b.imageUrl || '/assets/hero-burger.jpeg'} alt="" />
                <div className="candidate-pick-info">
                  <strong>{b.name}</strong>
                  <small>{formatCop(b.priceCop)}</small>
                </div>
                <span className="candidate-pick-check" aria-hidden="true">
                  {checked ? '✓' : '+'}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <AlertBanner
        type="error"
        title="Revisa la configuración de la campaña"
        message={error}
        onClose={() => setError('')}
      />

      <div className="campaign-form-actions">
        {editingCampaign && (
          <button type="button" className="button ghost" disabled={submitting} onClick={onCancelEdit}>
            Cancelar edición
          </button>
        )}
        <button type="submit" className="button full" disabled={submitting}>
          {submitting ? (
            <>
              <Spinner size="sm" label="Guardando ciclo de votación…" />
              <span>Guardando campaña…</span>
            </>
          ) : editingCampaign ? (
            'Guardar cambios del ciclo'
          ) : (
            'Guardar y programar campaña'
          )}
        </button>
      </div>
    </form>
  );
}

export default function AdminCampaigns({
  burgers: initialBurgers = null,
  campaigns: initialCampaigns = null
}) {
  const [burgers, setBurgers] = useState(initialBurgers || []);
  const [campaigns, setCampaigns] = useState(initialCampaigns || []);
  const [loading, setLoading] = useState(!initialBurgers || !initialCampaigns);
  const [refreshing, setRefreshing] = useState(false);
  const [campaignFilter, setCampaignFilter] = useState('ALL');
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [busyKey, setBusyKey] = useState('');
  const { notify } = useToast();

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const [burgersRes, campaignsRes] = await Promise.all([
          api('/burgers'),
          api('/campaigns')
        ]);
        setBurgers(burgersRes.burgers || []);
        setCampaigns(campaignsRes.campaigns || []);
        if (isRefresh) {
          notify({
            type: 'info',
            title: 'Campañas sincronizadas',
            message: 'Escrutinio y recetas actualizadas.'
          });
        }
      } catch (error) {
        notify({ type: 'error', title: 'Error al consultar campañas', message: error.message });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [notify]
  );

  useEffect(() => {
    if (!initialBurgers || !initialCampaigns) {
      loadData(false);
    }
  }, [initialBurgers, initialCampaigns, loadData]);

  async function closeCampaign(id) {
    const key = `close-${id}`;
    setBusyKey(key);
    try {
      await api(`/campaigns/${id}/close`, { method: 'POST' });
      if (editingCampaign?.id === id) setEditingCampaign(null);
      const msg = 'Campaña cerrada y hamburguesa ganadora proclamada.';
      notify({ type: 'success', title: 'Ciclo finalizado', message: msg });
      await loadData(false);
    } catch (error) {
      notify({ type: 'error', title: 'No se pudo cerrar la campaña', message: error.message });
    } finally {
      setBusyKey('');
    }
  }

  async function publishDraftCampaign(campaign) {
    const key = `publish-${campaign.id}`;
    setBusyKey(key);
    try {
      await api(`/campaigns/${campaign.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: campaign.name,
          startsAt: new Date(campaign.startsAt).toISOString(),
          endsAt: new Date(campaign.endsAt).toISOString(),
          status: 'PUBLISHED',
          burgerIds: campaign.candidates.map(c => c.id)
        })
      });
      const msg = `Campaña "${campaign.name}" publicada exitosamente.`;
      notify({ type: 'success', title: 'Campaña publicada', message: msg });
      await loadData(false);
    } catch (error) {
      notify({ type: 'error', title: 'No se pudo publicar la campaña', message: error.message });
    } finally {
      setBusyKey('');
    }
  }

  const filteredCampaigns = useMemo(() => {
    if (campaignFilter === 'ALL') return campaigns;
    if (campaignFilter === 'ACTIVE') return campaigns.filter(c => c.status === 'ACTIVE');
    if (campaignFilter === 'DRAFT') {
      return campaigns.filter(c => c.lifecycleStatus === 'DRAFT' || c.status === 'SCHEDULED');
    }
    return campaigns.filter(c => c.lifecycleStatus === 'CLOSED' || c.status === 'CLOSED');
  }, [campaigns, campaignFilter]);

  if (loading && !campaigns.length) {
    return (
      <LoaderCard
        compact
        title="Cargando ciclos de votación…"
        subtitle="Consultando campañas y candidatas en escrutinio."
      />
    );
  }

  return (
    <div className="admin-module-stack">
      <section className="admin-single-form-wrap">
        <CampaignForm
          burgers={burgers}
          editingCampaign={editingCampaign}
          onCancelEdit={() => setEditingCampaign(null)}
          onSaved={() => {
            setEditingCampaign(null);
            loadData(false);
          }}
        />
      </section>

      <section className="admin-list">
        <div className="section-heading admin-section-head">
          <div>
            <span className="eyebrow">CICLO DE VOTACIÓN Y ESCRUTINIO</span>
            <div className="datatable-title-row">
              <h2>Campañas ({filteredCampaigns.length})</h2>
              {refreshing && <Spinner size="sm" label="Actualizando campañas…" />}
            </div>
            <p className="admin-section-sub">
              Supervisa el ciclo completo desde borrador, apertura de urna en vivo y proclamación de ganadora.
            </p>
          </div>
          <div className="admin-toolbar">
            <div className="role-filter-group" role="group" aria-label="Filtrar campañas por estado">
              {[
                ['ALL', 'Todas'],
                ['ACTIVE', 'Activas'],
                ['DRAFT', 'Borradores / Prog.'],
                ['CLOSED', 'Cerradas']
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`filter-chip ${campaignFilter === key ? 'active' : ''}`}
                  onClick={() => setCampaignFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="button ghost small"
              disabled={refreshing}
              onClick={() => loadData(true)}
              aria-label="Actualizar ciclos de votación"
            >
              ↻
            </button>
          </div>
        </div>

        <div className="campaigns-admin-grid">
          {filteredCampaigns.map(c => {
            const campaignTotalVotes = c.candidates.reduce((sum, item) => sum + item.voteCount, 0);
            const campaignTotalDesired = c.candidates.reduce(
              (sum, item) => sum + (item.desiredQuantity ?? item.voteCount ?? 0),
              0
            );
            const winner = c.candidates.find(item => item.id === c.winnerBurgerId);
            const canModify =
              campaignTotalVotes === 0 &&
              (c.lifecycleStatus === 'DRAFT' || Date.now() < Date.parse(c.startsAt));
            const step =
              c.lifecycleStatus === 'CLOSED' || c.status === 'CLOSED'
                ? 3
                : c.lifecycleStatus === 'PUBLISHED'
                  ? 2
                  : 1;
            const publishingThis = busyKey === `publish-${c.id}`;
            const closingThis = busyKey === `close-${c.id}`;

            return (
              <article className={`campaign-admin-card ${c.status === 'ACTIVE' ? 'active-cycle' : ''}`} key={c.id}>
                <header className="campaign-admin-head">
                  <div>
                    <strong>{c.name}</strong>
                    <small>
                      {new Date(c.startsAt).toLocaleDateString('es-CO')} —{' '}
                      {new Date(c.endsAt).toLocaleDateString('es-CO')}
                    </small>
                  </div>
                  <div className="campaign-admin-badges">
                    <span className="meta-chip">{campaignTotalVotes} votos</span>
                    <span className="meta-chip">{campaignTotalDesired} uds. deseadas</span>
                    <span className={`status ${c.status === 'ACTIVE' ? 'on' : 'off'}`}>{c.status}</span>
                  </div>
                </header>

                <ol className="cycle-stepper" aria-label="Etapa del ciclo de votación">
                  <li className={step >= 1 ? 'done' : ''}>1. Diseño</li>
                  <li className={step === 2 ? 'current' : step > 2 ? 'done' : ''}>2. Votación</li>
                  <li className={step === 3 ? 'current done' : ''}>3. Ganadora</li>
                </ol>

                {winner && (
                  <div className="winner-banner">
                    <img src={winner.imageUrl || '/assets/hero-burger.jpeg'} alt="" />
                    <div>
                      <small>★ GANADORA PROCLAMADA</small>
                      <strong>{winner.name}</strong>
                    </div>
                  </div>
                )}

                <div className="result-bars">
                  {c.candidates.map((candidate, index) => {
                    const max = Math.max(1, ...c.candidates.map(x => x.voteCount));
                    const pct =
                      campaignTotalVotes > 0
                        ? Math.round((candidate.voteCount / campaignTotalVotes) * 100)
                        : 0;
                    const candidateDesired = candidate.desiredQuantity ?? candidate.voteCount ?? 0;
                    return (
                      <div className="candidate-result-row" key={candidate.id}>
                        <div className="candidate-result-head">
                          <span className="candidate-rank">#{index + 1}</span>
                          <img src={candidate.imageUrl || '/assets/hero-burger.jpeg'} alt="" />
                          <strong>{candidate.name}</strong>
                          <b>
                            {candidate.voteCount}v · {candidateDesired} uds. ({pct}%)
                          </b>
                        </div>
                        <i>
                          <em style={{ width: `${(candidate.voteCount / max) * 100}%` }} />
                        </i>
                      </div>
                    );
                  })}
                </div>

                <footer className="campaign-card-actions">
                  {canModify && (
                    <button
                      type="button"
                      className="button ghost small"
                      onClick={() => {
                        setEditingCampaign(c);
                        document.getElementById('campaign-studio')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      Editar ciclo
                    </button>
                  )}
                  {c.lifecycleStatus === 'DRAFT' && (
                    <button
                      type="button"
                      className="button small"
                      disabled={publishingThis}
                      onClick={() => publishDraftCampaign(c)}
                    >
                      {publishingThis ? (
                        <>
                          <Spinner size="sm" label="Publicando campaña…" />
                          <span>Publicando…</span>
                        </>
                      ) : (
                        'Publicar al club'
                      )}
                    </button>
                  )}
                  {c.lifecycleStatus === 'PUBLISHED' && (
                    <button
                      type="button"
                      className="button small"
                      disabled={closingThis}
                      onClick={() => closeCampaign(c.id)}
                    >
                      {closingThis ? (
                        <>
                          <Spinner size="sm" label="Cerrando votación y proclamando ganadora…" />
                          <span>Cerrando…</span>
                        </>
                      ) : (
                        'Cerrar y elegir ganadora'
                      )}
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

