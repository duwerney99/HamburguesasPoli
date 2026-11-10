import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../../api.js';
import { AlertBanner, LoaderCard, Spinner, useToast } from '../../ui/Feedback.jsx';
import { createSortHelpers, DataTableFooter, formatCop, PAGE_SIZE_OPTIONS } from './adminShared.jsx';

/**
 * Modal para Crear o Editar Ciclos de Votación (Campañas)
 */
export function CampaignModal({ open, campaign, burgers, onClose, onSaved }) {
  const isEdit = Boolean(campaign && campaign.id);
  const tomorrow = useMemo(() => new Date(Date.now() + 86400000), []);
  const defaultEnd = useMemo(() => new Date(Date.now() + 15 * 86400000), []);

  const buildInitial = useCallback(
    () => ({
      name: '',
      startsAt: new Date().toISOString().slice(0, 16),
      endsAt: defaultEnd.toISOString().slice(0, 16),
      status: 'DRAFT',
      burgerIds: []
    }),
    [defaultEnd]
  );

  const [form, setForm] = useState(buildInitial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { notify } = useToast();
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (open) {
      if (campaign) {
        setForm({
          name: campaign.name,
          startsAt: new Date(campaign.startsAt).toISOString().slice(0, 16),
          endsAt: new Date(campaign.endsAt).toISOString().slice(0, 16),
          status: campaign.lifecycleStatus === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
          burgerIds: campaign.candidates ? campaign.candidates.map(c => c.id) : []
        });
      } else {
        setForm(buildInitial());
      }
      setError('');
    }
  }, [open, campaign, buildInitial]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
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

  const handleNativeCancel = e => {
    e.preventDefault();
    if (!submitting) {
      onClose();
    }
  };

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

  function toggleBurger(id) {
    setForm(f => {
      if (f.burgerIds.includes(id)) {
        return { ...f, burgerIds: f.burgerIds.filter(item => item !== id) };
      }
      if (f.burgerIds.length >= 8) {
        notify({ type: 'warning', title: 'Límite alcanzado', message: 'Máximo 8 candidatas por ciclo.' });
        return f;
      }
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
    if (form.burgerIds.length < 2) {
      setError('Debes seleccionar al menos 2 hamburguesas candidatas.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const endpoint = isEdit ? `/campaigns/${campaign.id}` : '/campaigns';
      const method = isEdit ? 'PUT' : 'POST';
      await api(endpoint, {
        method,
        body: JSON.stringify({
          ...form,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString()
        })
      });
      const msg = isEdit
        ? `Ciclo "${form.name}" actualizado exitosamente.`
        : `Nuevo ciclo "${form.name}" creado y programado.`;
      notify({ type: 'success', title: isEdit ? 'Ciclo actualizado' : 'Ciclo programado', message: msg });
      onSaved?.(msg);
      onClose();
    } catch (err) {
      setError(err.message);
      notify({ type: 'error', title: 'No se pudo guardar el ciclo', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="admin-modal admin-modal-wide"
      closedby="any"
      aria-labelledby={titleId}
      onCancel={handleNativeCancel}
    >
      <div className="admin-modal-surface">
        <header className="admin-modal-head">
          <div className="admin-modal-head-main">
            <div className="admin-modal-badge" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
            </div>
            <div className="admin-modal-title-box">
              <h3 id={titleId}>
                {isEdit ? `Editar Ciclo de Votación y Escrutinio` : 'Nuevo ciclo de votación y escrutinio'}
              </h3>
            </div>
          </div>

          <div className="admin-modal-head-right">
            {durationDays > 0 && <span className="duration-badge">{durationDays} días</span>}
            <span className={`selection-counter ${form.burgerIds.length >= 2 ? 'ready' : ''}`}>
              {form.burgerIds.length} / 2–8 candidatas
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

        <form className="admin-form admin-modal-form" method="post" onSubmit={submit}>
          <div className="admin-modal-body">
            {/* Nombre de la Campaña */}
            <div className="modal-field">
              <label htmlFor="modal-campaign-name" className="modal-field-label">
                Nombre de la campaña o convocatoria <span className="required-mark">*</span>
              </label>
              <input
                id="modal-campaign-name"
                name="campaignName"
                type="text"
                required
                minLength="3"
                placeholder="Ej. Burger del Próximo Mes — Edición Noviembre"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="modal-field-input"
              />
            </div>

            {/* Fechas de Apertura y Cierre */}
            <div className="modal-form-grid">
              <div className="modal-field">
                <label htmlFor="modal-campaign-starts" className="modal-field-label">
                  Apertura de urna <span className="required-mark">*</span>
                </label>
                <input
                  id="modal-campaign-starts"
                  name="startsAt"
                  type="datetime-local"
                  required
                  value={form.startsAt}
                  onChange={e => setForm({ ...form, startsAt: e.target.value })}
                  className="modal-field-input"
                />
              </div>

              <div className="modal-field">
                <label htmlFor="modal-campaign-ends" className="modal-field-label">
                  Cierre programado <span className="required-mark">*</span>
                </label>
                <input
                  id="modal-campaign-ends"
                  name="endsAt"
                  type="datetime-local"
                  required
                  min={tomorrow.toISOString().slice(0, 16)}
                  value={form.endsAt}
                  onChange={e => setForm({ ...form, endsAt: e.target.value })}
                  className="modal-field-input"
                />
              </div>
            </div>

            {/* Atajos de Duración Rápida */}
            <div className="preset-bar" role="group" aria-label="Duración rápida de campaña">
              <small>Duración rápida recomendada:</small>
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

            {/* Visibilidad del Ciclo */}
            <fieldset>
              <legend>Visibilidad del ciclo de votación</legend>
              <div className="radio-pill-group">
                <label className="check">
                  <input
                    type="radio"
                    name="campaignStatus"
                    value="DRAFT"
                    checked={form.status === 'DRAFT'}
                    onChange={e => setForm({ ...form, status: e.target.value })}
                  />
                  <span>Borrador interno (no visible aún para clientes)</span>
                </label>
                <label className="check">
                  <input
                    type="radio"
                    name="campaignStatus"
                    value="PUBLISHED"
                    checked={form.status === 'PUBLISHED'}
                    onChange={e => setForm({ ...form, status: e.target.value })}
                  />
                  <span>Publicada al club (visible en urna digital al abrirse)</span>
                </label>
              </div>
            </fieldset>

            {/* Selector de Candidatas Participantes */}
            <fieldset className="candidate-picker-fieldset">
              <legend>
                <span>Candidatas participantes (mínimo 2, máximo 8)</span>
                <span className="picker-actions">
                  <button type="button" className="text-button" onClick={selectAllCandidates}>
                    Seleccionar 8
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
                        onChange={() => toggleBurger(b.id)}
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
              title="Revisa la configuración del ciclo"
              message={error}
              onClose={() => setError('')}
            />
          </div>

          <footer className="admin-modal-footer">
            <button type="button" className="button ghost" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="button" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner size="sm" label="Guardando ciclo de votación…" />
                  <span>Guardando ciclo…</span>
                </>
              ) : isEdit ? (
                'Guardar cambios del ciclo'
              ) : (
                'Guardar y programar ciclo'
              )}
            </button>
          </footer>
        </form>
      </div>
    </dialog>
  );
}

/**
 * Modal Detalle de Ciclo: Candidatas, Ganadora proclamada y Clientes votantes
 */
export function CampaignDetailModal({ open, campaign, onClose, onCloseCampaign }) {
  const [activeTab, setActiveTab] = useState('SCRUTINY'); // 'SCRUTINY' | 'VOTERS'
  const [votes, setVotes] = useState([]);
  const [loadingVotes, setLoadingVotes] = useState(false);
  const [votesError, setVotesError] = useState('');
  const [voterQuery, setVoterQuery] = useState('');
  const [voterCandidateFilter, setVoterCandidateFilter] = useState('ALL');
  const [voterPage, setVoterPage] = useState(1);
  const [voterPageSize, setVoterPageSize] = useState(10);
  const [voterSort, setVoterSort] = useState({ column: 'createdAt', direction: 'desc' });
  const [closing, setClosing] = useState(false);

  const dialogRef = useRef(null);
  const titleId = useId();

  const voterSorting = createSortHelpers(voterSort, setVoterSort, setVoterPage);

  const loadVotes = useCallback(async campaignId => {
    if (!campaignId) return;
    setLoadingVotes(true);
    setVotesError('');
    try {
      const data = await api(`/campaigns/${campaignId}/votes`);
      setVotes(Array.isArray(data?.votes) ? data.votes : []);
    } catch (err) {
      setVotesError(err.message || 'No se pudieron consultar los votos del ciclo.');
      setVotes([]);
    } finally {
      setLoadingVotes(false);
    }
  }, []);

  useEffect(() => {
    if (open && campaign?.id) {
      setActiveTab('SCRUTINY');
      setVoterQuery('');
      setVoterCandidateFilter('ALL');
      setVoterPage(1);
      setVoterSort({ column: 'createdAt', direction: 'desc' });
      loadVotes(campaign.id);
    }
  }, [open, campaign?.id, loadVotes]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
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
      if (clickedOutside && !closing) {
        onClose();
      }
    };

    dialog.addEventListener('pointerdown', onPointerDown);
    return () => dialog.removeEventListener('pointerdown', onPointerDown);
  }, [open, closing, onClose]);

  const campaignTotalVotes = campaign?.candidates
    ? campaign.candidates.reduce((sum, item) => sum + (item.voteCount || 0), 0)
    : 0;

  const winner = campaign?.candidates
    ? campaign.candidates.find(item => item.id === campaign.winnerBurgerId)
    : null;

  const isClosed = campaign?.lifecycleStatus === 'CLOSED' || campaign?.status === 'CLOSED';
  const isPublished = campaign?.lifecycleStatus === 'PUBLISHED';

  const filteredVotes = useMemo(() => {
    let result = votes || [];
    if (voterCandidateFilter !== 'ALL') {
      const targetBurgerId = Number(voterCandidateFilter);
      result = result.filter(v => v.burgerId === targetBurgerId);
    }
    const q = voterQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        v =>
          (v.userName || '').toLowerCase().includes(q) ||
          (v.userEmail || '').toLowerCase().includes(q) ||
          (v.burgerName || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [votes, voterCandidateFilter, voterQuery]);

  const sortedVotes = useMemo(() => {
    const list = [...filteredVotes];
    const { column, direction } = voterSort;
    const factor = direction === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (column === 'userName') {
        return factor * (a.userName || '').localeCompare(b.userName || '', 'es', { sensitivity: 'base' });
      }
      if (column === 'burgerName') {
        return factor * (a.burgerName || '').localeCompare(b.burgerName || '', 'es', { sensitivity: 'base' });
      }
      if (column === 'quantity') {
        return factor * ((a.quantity || 0) - (b.quantity || 0));
      }
      if (column === 'createdAt') {
        return factor * (new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
      }
      return 0;
    });
    return list;
  }, [filteredVotes, voterSort]);

  const voterPagination = useMemo(() => {
    const total = sortedVotes.length;
    const totalPages = Math.max(1, Math.ceil(total / voterPageSize));
    const page = Math.min(voterPage, totalPages);
    return {
      page,
      pageSize: voterPageSize,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages
    };
  }, [sortedVotes.length, voterPage, voterPageSize]);

  const paginatedVotes = useMemo(() => {
    const start = (voterPagination.page - 1) * voterPagination.pageSize;
    return sortedVotes.slice(start, start + voterPagination.pageSize);
  }, [sortedVotes, voterPagination]);

  async function handleCloseCampaign() {
    if (!campaign) return;
    setClosing(true);
    try {
      await onCloseCampaign(campaign.id);
      onClose();
    } finally {
      setClosing(false);
    }
  }

  if (!campaign) {
    return (
      <dialog
        ref={dialogRef}
        className="admin-modal admin-modal-wide"
        closedby="any"
        aria-hidden="true"
      />
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className="admin-modal admin-modal-wide"
      closedby="any"
      aria-labelledby={titleId}
      onCancel={e => {
        e.preventDefault();
        if (!closing) onClose();
      }}
    >
      <div className="admin-modal-surface">
        <header className="admin-modal-head">
          <div className="admin-modal-head-main">
            <div className="admin-modal-badge" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
            </div>
            <div className="admin-modal-title-box">
              <h3 id={titleId}>{campaign.name}</h3>
            </div>
          </div>

          <div className="admin-modal-head-right">
            <span className={`status ${campaign.status === 'ACTIVE' ? 'on' : 'off'}`}>
              {campaign.status}
            </span>
            <span className="price-preview-badge">{campaignTotalVotes} votos</span>
            <button
              type="button"
              className="alert-close modal-close-btn"
              onClick={onClose}
              disabled={closing}
              aria-label="Cerrar ventana de detalle"
            >
              ✕
            </button>
          </div>
        </header>

        {/* Pestañas de Navegación del Detalle */}
        <nav className="modal-tabs" aria-label="Secciones del ciclo de votación">
          <button
            type="button"
            className={`modal-tab-btn ${activeTab === 'SCRUTINY' ? 'active' : ''}`}
            onClick={() => setActiveTab('SCRUTINY')}
          >
            <span>Candidatas y Escrutinio</span>
            <span className="badge-pill">{campaign.candidates?.length || 0}</span>
          </button>
          <button
            type="button"
            className={`modal-tab-btn ${activeTab === 'VOTERS' ? 'active' : ''}`}
            onClick={() => setActiveTab('VOTERS')}
          >
            <span>Clientes Votantes</span>
            <span className="badge-pill">{votes.length}</span>
          </button>
        </nav>

        <div className="admin-modal-body">
          {activeTab === 'SCRUTINY' && (
            <div className="flex flex-col gap-5">
              {/* Ganadora Proclamada */}
              {winner ? (
                <div className="winner-showcase-card">
                  <img
                    src={winner.imageUrl || '/assets/hero-burger.jpeg'}
                    alt={winner.name}
                    className="winner-showcase-img"
                  />
                  <div className="winner-showcase-copy">
                    <span className="winner-showcase-tag">
                      ★ HAMBURGUESA GANADORA PROCLAMADA
                    </span>
                    <h4>{winner.name}</h4>
                    <p className="text-xs text-text-secondary m-0">
                      {winner.ingredients}
                    </p>
                    <div className="winner-showcase-meta">
                      <span>Precio: <strong>{formatCop(winner.priceCop)}</strong></span>
                      <span>Votos ganadores: <strong>{winner.voteCount} votos</strong></span>
                      <span>
                        Porcentaje victoria:{' '}
                        <strong>
                          {campaignTotalVotes > 0
                            ? Math.round((winner.voteCount / campaignTotalVotes) * 100)
                            : 0}
                          %
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>
              ) : isClosed ? (
                <div className="confirm-dialog-warning">
                  <p className="m-0 text-sm font-semibold text-amber">
                    Este ciclo está cerrado pero no registró votos suficientes para proclamar ganadora.
                  </p>
                </div>
              ) : null}

              {/* Lista y barras de escrutinio de todas las candidatas */}
              <div className="result-bars">
                {campaign.candidates?.map((candidate, index) => {
                  const max = Math.max(1, ...(campaign.candidates || []).map(x => x.voteCount || 0));
                  const pct =
                    campaignTotalVotes > 0
                      ? Math.round((candidate.voteCount / campaignTotalVotes) * 100)
                      : 0;
                  const candidateDesired = candidate.desiredQuantity ?? candidate.voteCount ?? 0;
                  const isWinnerCandidate = candidate.id === campaign.winnerBurgerId;

                  return (
                    <div
                      className={`candidate-result-row ${isWinnerCandidate ? 'border border-amber/40 rounded-lg p-2 bg-amber/5' : ''}`}
                      key={candidate.id}
                    >
                      <div className="candidate-result-head">
                        <span className="candidate-rank">#{index + 1}</span>
                        <img src={candidate.imageUrl || '/assets/hero-burger.jpeg'} alt="" />
                        <strong>
                          {candidate.name} {isWinnerCandidate && '👑'}
                        </strong>
                        <b className="ml-auto">
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
            </div>
          )}

          {activeTab === 'VOTERS' && (
            <div className="flex flex-col gap-4">
              {/* Barra de herramientas / filtros del DataTable de Votantes */}
              <div className="admin-toolbar datatable-toolbar flex-wrap">
                {/* Filtro por hamburguesa candidata */}
                <div className="datatable-pagesize">
                  <label htmlFor="voter-candidate-filter">Candidata</label>
                  <select
                    id="voter-candidate-filter"
                    value={voterCandidateFilter}
                    onChange={e => {
                      setVoterCandidateFilter(e.target.value);
                      setVoterPage(1);
                    }}
                  >
                    <option value="ALL">Todas las candidatas ({votes.length})</option>
                    {campaign.candidates?.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.voteCount}v)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="datatable-controls-right flex-1 justify-end">
                  {/* Búsqueda en vivo */}
                  <div className="admin-search-field flex-1 max-w-sm">
                    <input
                      type="search"
                      placeholder="Buscar cliente, correo o receta…"
                      value={voterQuery}
                      onChange={e => {
                        setVoterQuery(e.target.value);
                        setVoterPage(1);
                      }}
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      aria-label="Buscar votos por cliente, correo o hamburguesa"
                    />
                  </div>

                  {/* Selector de filas por página */}
                  <div className="datatable-pagesize">
                    <label htmlFor="voter-pagesize-select">Filas</label>
                    <select
                      id="voter-pagesize-select"
                      value={voterPageSize}
                      onChange={e => {
                        setVoterPageSize(Number(e.target.value));
                        setVoterPage(1);
                      }}
                    >
                      {PAGE_SIZE_OPTIONS.map(size => (
                        <option key={size} value={size}>
                          {size} / pág.
                        </option>
                      ))}
                    </select>
                  </div>

                  {(voterQuery || voterCandidateFilter !== 'ALL') && (
                    <button
                      type="button"
                      className="button ghost small"
                      onClick={() => {
                        setVoterQuery('');
                        setVoterCandidateFilter('ALL');
                        setVoterPage(1);
                      }}
                      title="Limpiar filtros de búsqueda"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>

              {loadingVotes ? (
                <div className="p-8 text-center">
                  <Spinner size="md" label="Consultando clientes votantes…" />
                  <p className="text-xs text-muted mt-2">Cargando bitácora de sufragio…</p>
                </div>
              ) : votesError ? (
                <AlertBanner type="error" message={votesError} />
              ) : !filteredVotes.length ? (
                <div className="p-8 text-center border border-surface-line rounded-lg bg-surface-card/40">
                  <p className="text-sm text-text-secondary m-0">
                    {votes.length === 0
                      ? 'Aún no se han registrado votos de clientes en este ciclo de votación.'
                      : 'No hay votos que coincidan con los filtros aplicados.'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="table-wrap datatable-wrap">
                    <table className="admin-table datatable">
                      <thead>
                        <tr>
                          <th scope="col" aria-sort={voterSorting.ariaSort('userName')}>
                            <button
                              type="button"
                              className="datatable-sort-btn"
                              onClick={() => voterSorting.toggle('userName')}
                            >
                              <span>Cliente votante</span>
                              {voterSorting.indicator('userName')}
                            </button>
                          </th>
                          <th scope="col" aria-sort={voterSorting.ariaSort('burgerName')}>
                            <button
                              type="button"
                              className="datatable-sort-btn"
                              onClick={() => voterSorting.toggle('burgerName')}
                            >
                              <span>Hamburguesa elegida</span>
                              {voterSorting.indicator('burgerName')}
                            </button>
                          </th>
                          <th scope="col" className="text-center" aria-sort={voterSorting.ariaSort('quantity')}>
                            <button
                              type="button"
                              className="datatable-sort-btn"
                              onClick={() => voterSorting.toggle('quantity')}
                            >
                              <span>Demanda solicitada</span>
                              {voterSorting.indicator('quantity')}
                            </button>
                          </th>
                          <th scope="col" aria-sort={voterSorting.ariaSort('createdAt')}>
                            <button
                              type="button"
                              className="datatable-sort-btn"
                              onClick={() => voterSorting.toggle('createdAt')}
                            >
                              <span>Fecha y hora del voto</span>
                              {voterSorting.indicator('createdAt')}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedVotes.map(v => (
                          <tr key={v.id}>
                            <td>
                              <div className="voter-client-cell">
                                <span className="voter-avatar">
                                  {v.userName ? v.userName.charAt(0).toUpperCase() : 'C'}
                                </span>
                                <div>
                                  <strong>{v.userName}</strong>
                                  <small className="block text-xs text-muted">{v.userEmail}</small>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="voter-burger-cell">
                                <img
                                  src={v.burgerImageUrl || '/assets/hero-burger.jpeg'}
                                  alt={v.burgerName}
                                />
                                <div>
                                  <strong>{v.burgerName}</strong>
                                  <small className="block text-xs text-amber font-mono">
                                    {formatCop(v.burgerPriceCop)}
                                  </small>
                                </div>
                              </div>
                            </td>
                            <td className="text-center">
                              <span className="meta-chip">
                                {v.quantity} {v.quantity === 1 ? 'ud.' : 'uds.'}
                              </span>
                            </td>
                            <td>
                              <span className="text-xs font-mono text-text-secondary">
                                {new Date(v.createdAt).toLocaleString('es-CO')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <DataTableFooter
                    pagination={voterPagination}
                    currentCount={paginatedVotes.length}
                    loading={loadingVotes}
                    onPageChange={setVoterPage}
                    ariaLabel="Paginación de clientes votantes"
                    itemNoun="votos"
                  />
                </>
              )}
            </div>
          )}
        </div>

        <footer className="admin-modal-footer">
          {isPublished && (
            <button
              type="button"
              className="button small"
              disabled={closing}
              onClick={handleCloseCampaign}
            >
              {closing ? (
                <>
                  <Spinner size="sm" label="Cerrando ciclo y proclamando ganadora…" />
                  <span>Proclamando ganadora…</span>
                </>
              ) : (
                'Cerrar urna y elegir ganadora'
              )}
            </button>
          )}
          <button type="button" className="button ghost" onClick={onClose} disabled={closing}>
            Cerrar detalle
          </button>
        </footer>
      </div>
    </dialog>
  );
}

// Retrocompatibilidad con import de CampaignForm
export function CampaignForm({ burgers, editingCampaign, onCancelEdit, onSaved }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="button" onClick={() => setOpen(true)}>
        {editingCampaign ? 'Editar ciclo' : '+ Nuevo ciclo'}
      </button>
      <CampaignModal
        open={open}
        campaign={editingCampaign}
        burgers={burgers}
        onClose={() => {
          setOpen(false);
          onCancelEdit?.();
        }}
        onSaved={onSaved}
      />
    </>
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

  // Filtros y Paginación de la DataTable
  const [campaignFilter, setCampaignFilter] = useState('ALL');
  const [campaignSearch, setCampaignSearch] = useState('');
  const [campaignPage, setCampaignPage] = useState(1);
  const [campaignPageSize, setCampaignPageSize] = useState(10);

  // Modales
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDetailCampaign, setSelectedDetailCampaign] = useState(null);

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

  function handleCreateCampaign() {
    setEditingCampaign(null);
    setModalOpen(true);
  }

  function handleEditCampaign(c) {
    setEditingCampaign(c);
    setModalOpen(true);
  }

  function handleOpenDetail(c) {
    setSelectedDetailCampaign(c);
    setDetailModalOpen(true);
  }

  async function closeCampaign(id) {
    const key = `close-${id}`;
    setBusyKey(key);
    try {
      const res = await api(`/campaigns/${id}/close`, { method: 'POST' });
      const winnerName = res.winner ? res.winner.name : '';
      const msg = winnerName
        ? `Campaña cerrada. ¡Ganadora proclamada: ${winnerName}!`
        : 'Campaña cerrada con éxito.';
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

  // Filtrado por tab y búsqueda por nombre o candidata
  const filteredCampaigns = useMemo(() => {
    let result = campaigns;

    // Filtro por estado
    if (campaignFilter === 'ACTIVE') {
      result = result.filter(c => c.status === 'ACTIVE');
    } else if (campaignFilter === 'DRAFT') {
      result = result.filter(c => c.lifecycleStatus === 'DRAFT' || c.status === 'SCHEDULED');
    } else if (campaignFilter === 'CLOSED') {
      result = result.filter(c => c.lifecycleStatus === 'CLOSED' || c.status === 'CLOSED');
    }

    // Filtro por texto
    const q = campaignSearch.trim().toLowerCase();
    if (q) {
      result = result.filter(
        c =>
          c.name.toLowerCase().includes(q) ||
          c.candidates.some(cand => cand.name.toLowerCase().includes(q))
      );
    }

    return result;
  }, [campaigns, campaignFilter, campaignSearch]);

  // Paginación
  const campaignPagination = useMemo(() => {
    const total = filteredCampaigns.length;
    const totalPages = Math.max(1, Math.ceil(total / campaignPageSize));
    const page = Math.min(campaignPage, totalPages);
    return {
      page,
      pageSize: campaignPageSize,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages
    };
  }, [filteredCampaigns.length, campaignPage, campaignPageSize]);

  const paginatedCampaigns = useMemo(() => {
    const start = (campaignPagination.page - 1) * campaignPagination.pageSize;
    return filteredCampaigns.slice(start, start + campaignPagination.pageSize);
  }, [filteredCampaigns, campaignPagination]);

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
      <section className="admin-list datatable-section">
        <div className="section-heading admin-section-head">
          <div>
            <div className="datatable-title-row">
              <h2 id="admin-campaigns-caption">Ciclos de Votación</h2>
              {refreshing && <Spinner size="sm" label="Actualizando campañas…" />}
            </div>
          </div>

          <div className="admin-toolbar">
            <button
              type="button"
              className="button small"
              onClick={handleCreateCampaign}
              title="Crear y programar un nuevo ciclo de votación"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Nuevo ciclo</span>
            </button>

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
                  onClick={() => {
                    setCampaignFilter(key);
                    setCampaignPage(1);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="datatable-controls-right">
              <div className="admin-search-field">
                <label htmlFor="admin-campaign-search" className="visually-hidden">
                  Filtrar campañas por nombre o candidata
                </label>
                <input
                  id="admin-campaign-search"
                  name="campaignSearch"
                  type="search"
                  placeholder="Buscar ciclo o candidata…"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  value={campaignSearch}
                  onChange={e => {
                    setCampaignSearch(e.target.value);
                    setCampaignPage(1);
                  }}
                />
              </div>

              <div className="datatable-pagesize">
                <label htmlFor="admin-campaign-pagesize">Filas</label>
                <select
                  id="admin-campaign-pagesize"
                  name="campaignPageSize"
                  value={campaignPageSize}
                  onChange={e => {
                    setCampaignPageSize(Number(e.target.value));
                    setCampaignPage(1);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map(size => (
                    <option key={size} value={size}>
                      {size} / pág.
                    </option>
                  ))}
                </select>
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
        </div>

        {/* Datatable de Ciclos de Votación */}
        <div
          tabIndex={0}
          role="region"
          aria-labelledby="admin-campaigns-caption"
          className="table-wrap responsive-table-region datatable-wrap"
        >
          <table className="admin-table campaigns-table datatable">
            <thead>
              <tr>
                <th scope="col" style={{ minWidth: '300px', width: '300px', maxWidth: '300px' }}>Ciclo / Período</th>
                <th scope="col" style={{ minWidth: '180px', width: '180px', maxWidth: '180px' }}>Estado</th>
                <th scope="col" style={{ minWidth: '150px', width: '150px', maxWidth: '150px' }}>Candidatas</th>
                <th scope="col" style={{ minWidth: '150px', width: '150px', maxWidth: '150px' }}>Votos y Demanda</th>
                <th scope="col" style={{ minWidth: '200px', width: '200px', maxWidth: '200px' }}>Ganadora / Líder</th>
                <th
                  scope="col"
                  className="text-center"
                  style={{ minWidth: '290px', width: '290px', maxWidth: '290px' }}
                >
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedCampaigns.map(c => {
                const campaignTotalVotes = c.candidates ? c.candidates.reduce((sum, item) => sum + item.voteCount, 0) : 0;
                const campaignTotalDesired = c.candidates
                  ? c.candidates.reduce((sum, item) => sum + (item.desiredQuantity ?? item.voteCount ?? 0), 0 )
                  : 0;

                const winner = c.candidates?.find(item => item.id === c.winnerBurgerId);
                const leader = c.candidates?.length ? [...c.candidates].sort((a, b) => b.voteCount - a.voteCount)[0] : null;

                const canModify = campaignTotalVotes === 0 && (c.lifecycleStatus === 'DRAFT' || Date.now() < Date.parse(c.startsAt));

                const isDraft = c.lifecycleStatus === 'DRAFT';
                const isPublished = c.lifecycleStatus === 'PUBLISHED';

                const publishingThis = busyKey === `publish-${c.id}`;
                const closingThis = busyKey === `close-${c.id}`;

                return (
                  <tr key={c.id}>
                    {/* 1. Ciclo / Período */}
                    <th scope="row">
                      <div className="flex flex-col gap-0.5">
                        <strong className="text-white text-sm">{c.name}</strong>
                        <span className="text-xs text-muted font-mono">
                          {new Date(c.startsAt).toLocaleDateString('es-CO')} al{' '}
                          {new Date(c.endsAt).toLocaleDateString('es-CO')}
                        </span>
                      </div>
                    </th>

                    {/* 2. Estado */}
                    <td>
                      <span className={`status ${c.status === 'ACTIVE' ? 'on' : 'off'}`}>
                        {c.status === 'ACTIVE'
                          ? 'En Votación'
                          : c.status === 'SCHEDULED'
                            ? 'Programada'
                            : c.lifecycleStatus === 'DRAFT' ? 'Borrador' : 'Cerrada'}
                      </span>
                    </td>

                    {/* 3. Candidatas */}
                    <td>
                      <div className="flex items-center">
                        <span className="text-xs text-text-secondary font-mono">
                          {c.candidates?.length || 0} candidatas
                        </span>
                      </div>
                    </td>

                    {/* 4. Votos y Demanda */}
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold text-white font-mono">
                          {campaignTotalVotes} votos
                        </span>
                        <span className="text-xs text-muted font-mono">
                          {campaignTotalDesired} uds. deseadas
                        </span>
                      </div>
                    </td>

                    {/* 5. Ganadora / Líder */}
                    <td className='text-center'>
                      {winner ? (
                        <span className="winner-pill">
                          ★ {winner.name}
                        </span>
                      ) : c.status === 'ACTIVE' && leader && leader.voteCount > 0 ? (
                        <span className="leader-pill">
                          ▲ {leader.name} ({campaignTotalVotes > 0 ? Math.round((leader.voteCount / campaignTotalVotes) * 100) : 0}%)
                        </span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>

                    {/* 6. Acciones */}
                    <td className="text-center">
                      <div
                        className="admin-table-actions"
                        role="group"
                        aria-label={`Acciones para campaña ${c.name}`}
                      >
                        {/* Ver Detalle / Escrutinio */}
                        <button
                          type="button"
                          className="action-btn action-btn-edit"
                          onClick={() => handleOpenDetail(c)}
                          title={`Ver candidatas, votos y clientes de ${c.name}`}
                          aria-label={`Ver detalle de ${c.name}`}
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          <span>Detalle</span>
                        </button>

                        {/* Editar Ciclo */}
                        {canModify && (
                          <button
                            type="button"
                            className="action-btn action-btn-visibility"
                            onClick={() => handleEditCampaign(c)}
                            title={`Editar configuración y candidatas de ${c.name}`}
                            aria-label={`Editar ${c.name}`}
                          >
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                              <path d="m15 5 4 4" />
                            </svg>
                            <span>Editar</span>
                          </button>
                        )}

                        {/* Publicar si es Borrador */}
                        {isDraft && (
                          <button
                            type="button"
                            className="action-btn action-btn-visibility inactive-state"
                            disabled={publishingThis}
                            onClick={() => publishDraftCampaign(c)}
                            title="Publicar campaña para el club"
                          >
                            {publishingThis ? (
                              <Spinner size="xs" label="Publicando…" />
                            ) : (
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="m5 12 7-7 7 7" />
                                <path d="M12 19V5" />
                              </svg>
                            )}
                            <span>Publicar</span>
                          </button>
                        )}

                        {/* Cerrar Urna si está publicada / activa */}
                        {isPublished && (
                          <button
                            type="button"
                            className="action-btn action-btn-delete"
                            disabled={closingThis}
                            onClick={() => closeCampaign(c.id)}
                            title="Cerrar urna y proclamar ganadora oficial"
                          >
                            {closingThis ? (
                              <Spinner size="xs" label="Cerrando…" />
                            ) : (
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                                <path d="M4 22h16" />
                                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                              </svg>
                            )}
                            <span>Cerrar</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!paginatedCampaigns.length && (
                <tr>
                  <td colSpan={6} className="empty-table-cell">
                    No hay ciclos de votación que coincidan con el filtro actual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <DataTableFooter
          pagination={campaignPagination}
          currentCount={paginatedCampaigns.length}
          loading={refreshing}
          onPageChange={setCampaignPage}
          ariaLabel="Paginación de ciclos de votación"
          itemNoun="ciclos"
        />
      </section>

      {/* Modal para Crear y Editar Campañas */}
      <CampaignModal
        open={modalOpen}
        campaign={editingCampaign}
        burgers={burgers}
        onClose={() => setModalOpen(false)}
        onSaved={() => loadData(false)}
      />

      {/* Modal para Ver Detalle del Ciclo: Candidatas, Ganadora y Clientes Votantes */}
      <CampaignDetailModal
        open={detailModalOpen}
        campaign={selectedDetailCampaign}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedDetailCampaign(null);
        }}
        onCloseCampaign={closeCampaign}
      />
    </div>
  );
}
