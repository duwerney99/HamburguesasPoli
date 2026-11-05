import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '../../api.js';
import { AlertBanner, ConfirmDialog, LoaderCard, Spinner, useToast } from '../../ui/Feedback.jsx';
import {
  DataTableFooter,
  formatCop,
  PAGE_SIZE_OPTIONS,
  readAndOptimizeImage
} from './adminShared.jsx';

export function BurgerModal({ open, burger, onClose, onSaved }) {
  const isEdit = Boolean(burger && burger.id);
  const initial = useMemo(
    () => ({
      name: burger?.name || '',
      description: burger?.description || '',
      ingredients: burger?.ingredients || '',
      imageUrl: burger?.imageUrl || '/assets/hero-burger.jpeg',
      priceCop: burger?.priceCop != null ? burger.priceCop : 28000,
      active: burger?.active !== undefined ? Boolean(burger.active) : true
    }),
    [burger]
  );

  const [form, setForm] = useState(initial);
  const [fileMeta, setFileMeta] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { notify } = useToast();
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (open) {
      setForm(initial);
      setFileMeta(null);
      setError('');
    }
  }, [open, initial]);

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
      if (clickedOutside && !submitting && !optimizing) {
        onClose();
      }
    };

    dialog.addEventListener('pointerdown', onPointerDown);
    return () => dialog.removeEventListener('pointerdown', onPointerDown);
  }, [open, submitting, optimizing, onClose]);

  const handleNativeCancel = e => {
    e.preventDefault();
    if (!submitting && !optimizing) {
      onClose();
    }
  };

  async function handleFileSelect(file) {
    if (!file) return;
    setError('');
    setOptimizing(true);
    try {
      const optimizedDataUrl = await readAndOptimizeImage(file);
      setForm(prev => ({ ...prev, imageUrl: optimizedDataUrl }));
      setFileMeta({
        name: file.name,
        sizeKb: Math.max(1, Math.round(file.size / 1024))
      });
    } catch (err) {
      setError(err.message);
      notify({ type: 'error', title: 'Imagen no válida', message: err.message });
    } finally {
      setOptimizing(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileSelect(file);
  }

  function clearImage() {
    setForm(prev => ({ ...prev, imageUrl: '/assets/hero-burger.jpeg' }));
    setFileMeta(null);
  }

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (isEdit) {
        await api(`/burgers/${burger.id}`, {
          method: 'PUT',
          body: JSON.stringify(form)
        });
        const msg = `Hamburguesa "${form.name}" actualizada con éxito.`;
        notify({ type: 'success', title: 'Receta actualizada', message: msg });
        onSaved?.(msg);
      } else {
        await api('/burgers', {
          method: 'POST',
          body: JSON.stringify(form)
        });
        const msg = `Hamburguesa "${form.name}" creada e incorporada al catálogo.`;
        notify({ type: 'success', title: 'Hamburguesa creada', message: msg });
        onSaved?.(msg);
      }
      onClose();
    } catch (err) {
      setError(err.message);
      notify({ type: 'error', title: 'Error al guardar hamburguesa', message: err.message });
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
      onCancel={handleNativeCancel}
    >
      <div className="admin-modal-surface">
        <header className="admin-modal-head">
          <div className="admin-modal-head-main">
            <div className="admin-modal-badge" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 11h16a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-1a1 1 0 0 1 1-1Z" />
                <path d="M4 8a8 8 0 0 1 16 0" />
                <path d="M5 19h14" />
              </svg>
            </div>
            <div className="admin-modal-title-box">
              <h3 id={titleId}>
                {isEdit ? `Editar Producto` : 'Nuevo Producto'}
              </h3>
            </div>
          </div>

          <div className="admin-modal-head-right">
            <span className="price-preview-badge">{formatCop(form.priceCop || 0)}</span>
            <button
              type="button"
              className="alert-close modal-close-btn"
              onClick={onClose}
              disabled={submitting || optimizing}
              aria-label="Cerrar modal"
            >
              ✕
            </button>
          </div>
        </header>

        <form className="admin-form admin-modal-form" method="post" onSubmit={submit}>
          <div className="admin-modal-body">
            {/* Fila 1: Nombre de la burger y Precio */}
            <div className="modal-form-grid">
              <div className="modal-field">
                <label htmlFor="modal-burger-name" className="modal-field-label">
                  Nombre de la burger <span className="required-mark">*</span>
                </label>
                <input
                  id="modal-burger-name"
                  name="burgerName"
                  type="text"
                  required
                  minLength="2"
                  placeholder="Ej. Smoky Bourbon Melt"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="modal-field-input"
                />
              </div>

              <div className="modal-field">
                <label htmlFor="modal-burger-price" className="modal-field-label">
                  Precio COP <span className="required-mark">*</span>
                </label>
                <div className="price-input-wrap">
                  <span className="price-input-currency" aria-hidden="true">$</span>
                  <input
                    id="modal-burger-price"
                    name="priceCop"
                    type="number"
                    min="1000"
                    step="500"
                    required
                    placeholder="28000"
                    value={form.priceCop}
                    onChange={e => setForm({ ...form, priceCop: Number(e.target.value) })}
                    className="modal-field-input modal-field-price"
                  />
                </div>
              </div>
            </div>

            {/* Fila 2: Switch moderno de visibilidad en tienda y catálogo */}
            <div className="active-toggle-card">
              <div className="active-toggle-copy">
                <div className="active-toggle-title-row">
                  <span className="active-toggle-dot" aria-hidden="true" />
                  <strong id="active-toggle-heading">Visibilidad en tienda y catálogo activo</strong>
                </div>
                <p id="active-toggle-sub">
                  Al estar activa, estará disponible para pedidos en línea y participará en campañas de votación.
                </p>
              </div>
              <label className="switch-toggle" aria-labelledby="active-toggle-heading">
                <input
                  type="checkbox"
                  name="burgerActive"
                  checked={form.active}
                  onChange={e => setForm({ ...form, active: e.target.checked })}
                />
                <span className="switch-slider" aria-hidden="true" />
              </label>
            </div>

            {/* Fila 3: Descripción gastronómica */}
            <div className="modal-field">
              <div className="modal-field-head">
                <label htmlFor="modal-burger-desc" className="modal-field-label">
                  Descripción gastronómica <span className="required-mark">*</span>
                </label>
                <small className="field-hint">Mínimo 10 caracteres</small>
              </div>
              <textarea
                id="modal-burger-desc"
                name="burgerDescription"
                rows="3"
                required
                minLength="10"
                placeholder="Describe el perfil de sabor, punto de cocción, jugosidad y texturas..."
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="modal-field-textarea"
              />
            </div>

            {/* Fila 4: Ingredientes separados por coma */}
            <div className="modal-field">
              <div className="modal-field-head">
                <label htmlFor="modal-burger-ingredients" className="modal-field-label">
                  Ingredientes principales <span className="required-mark">*</span>
                </label>
                <small className="field-hint">Separados por coma</small>
              </div>
              <textarea
                id="modal-burger-ingredients"
                name="burgerIngredients"
                rows="2"
                required
                placeholder="Carne Angus 200g, cheddar madurado 12 meses, tocineta glaseada en maple, cebolla crispy..."
                value={form.ingredients}
                onChange={e => setForm({ ...form, ingredients: e.target.value })}
                className="modal-field-textarea"
              />
            </div>

            {/* Fila 5: Zona de Fotografía del producto */}
            <div
              className={`image-upload-zone modal-upload-zone ${dragActive ? 'drag-over' : ''}`}
              onDragOver={e => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              <div className="image-upload-preview">
                <div className="image-preview-frame">
                  <img src={form.imageUrl} alt="Vista previa de la hamburguesa" />
                </div>
                <div className="image-upload-meta">
                  <strong>
                    {optimizing
                      ? 'Optimizando fotografía…'
                      : fileMeta
                        ? fileMeta.name
                        : isEdit
                          ? 'Fotografía actual de la receta'
                          : 'Imagen predeterminada del club'}
                  </strong>
                  <small>
                    {optimizing
                      ? 'Ajustando dimensiones y compresión WebP'
                      : fileMeta
                        ? `${fileMeta.sizeKb} KB · Optimizada automáticamente`
                        : 'Sube una foto en JPG, PNG o WEBP (máx. 5 MB) · Optimización WebP'}
                  </small>
                </div>
                {optimizing ? (
                  <Spinner size="sm" label="Optimizando fotografía…" />
                ) : (
                  (fileMeta || (isEdit && form.imageUrl !== '/assets/hero-burger.jpeg')) && (
                    <button type="button" className="text-button" onClick={clearImage}>
                      Restablecer predeterminada
                    </button>
                  )
                )}
              </div>
              <label className="file-input-label">
                <span>Fotografía del producto</span>
                <input
                  name="burgerImage"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={optimizing || submitting}
                  onChange={e => handleFileSelect(e.target.files?.[0])}
                />
              </label>
            </div>

            <AlertBanner
              type="error"
              title="Revisa los datos de la hamburguesa"
              message={error}
              onClose={() => setError('')}
            />
          </div>

          <footer className="admin-modal-footer">
            <button
              type="button"
              className="button ghost"
              onClick={onClose}
              disabled={submitting || optimizing}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="button"
              disabled={submitting || optimizing}
            >
              {submitting ? (
                <>
                  <Spinner size="sm" label="Guardando receta…" />
                  <span>Guardando…</span>
                </>
              ) : isEdit ? (
                'Guardar cambios'
              ) : (
                'Crear hamburguesa'
              )}
            </button>
          </footer>
        </form>
      </div>
    </dialog>
  );
}

// Wrapper retrocompatible si se importa BurgerForm
export function BurgerForm({ onSaved }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="button" onClick={() => setOpen(true)}>
        + Nueva hamburguesa
      </button>
      <BurgerModal open={open} burger={null} onClose={() => setOpen(false)} onSaved={onSaved} />
    </>
  );
}

export default function AdminProducts({ burgers: initialBurgers = null }) {
  const [burgers, setBurgers] = useState(initialBurgers || []);
  const [loading, setLoading] = useState(!initialBurgers);
  const [refreshing, setRefreshing] = useState(false);
  const [burgerSearch, setBurgerSearch] = useState('');
  const [burgerPage, setBurgerPage] = useState(1);
  const [burgerPageSize, setBurgerPageSize] = useState(10);
  const [busyKey, setBusyKey] = useState('');
  const [burgerToDelete, setBurgerToDelete] = useState(null);

  // Estado del modal para Crear / Editar
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBurger, setEditingBurger] = useState(null);

  const { notify } = useToast();

  const loadBurgers = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const data = await api('/burgers');
        setBurgers(data.burgers || []);
        if (isRefresh) {
          notify({
            type: 'info',
            title: 'Catálogo sincronizado',
            message: 'Lista de hamburguesas actualizada.'
          });
        }
      } catch (error) {
        notify({ type: 'error', title: 'Error al consultar catálogo', message: error.message });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [notify]
  );

  useEffect(() => {
    if (!initialBurgers) {
      loadBurgers(false);
    }
  }, [initialBurgers, loadBurgers]);

  function handleCreateBurger() {
    setEditingBurger(null);
    setModalOpen(true);
  }

  function handleEditBurger(burger) {
    setEditingBurger(burger);
    setModalOpen(true);
  }

  async function toggleBurgerVisibility(burger) {
    const key = `burger-${burger.id}`;
    setBusyKey(key);
    try {
      const nextActive = !burger.active;
      await api(`/burgers/${burger.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...burger, active: nextActive })
      });
      const msg = nextActive
        ? `Hamburguesa "${burger.name}" activada y visible para los clientes.`
        : `Hamburguesa "${burger.name}" desactivada y oculta para los clientes.`;
      notify({ type: 'success', title: 'Visibilidad actualizada', message: msg });
      await loadBurgers(false);
    } catch (error) {
      notify({ type: 'error', title: 'Error al actualizar receta', message: error.message });
    } finally {
      setBusyKey('');
    }
  }

  async function deleteBurger(burger) {
    const key = `delete-${burger.id}`;
    setBusyKey(key);
    try {
      await api(`/burgers/${burger.id}`, { method: 'DELETE' });
      setBurgerToDelete(null);
      const msg = `Hamburguesa "${burger.name}" eliminada del catálogo y oculta para los clientes.`;
      notify({ type: 'warning', title: 'Producto eliminado', message: msg });
      await loadBurgers(false);
    } catch (error) {
      notify({ type: 'error', title: 'No se pudo eliminar el producto', message: error.message });
    } finally {
      setBusyKey('');
    }
  }

  const filteredBurgers = useMemo(() => {
    const q = burgerSearch.trim().toLowerCase();
    if (!q) return burgers;
    return burgers.filter(
      b => b.name.toLowerCase().includes(q) || b.ingredients.toLowerCase().includes(q)
    );
  }, [burgers, burgerSearch]);

  const burgerPagination = useMemo(() => {
    const total = filteredBurgers.length;
    const totalPages = Math.max(1, Math.ceil(total / burgerPageSize));
    const page = Math.min(burgerPage, totalPages);
    return {
      page,
      pageSize: burgerPageSize,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages
    };
  }, [filteredBurgers.length, burgerPage, burgerPageSize]);

  const paginatedBurgers = useMemo(() => {
    const start = (burgerPagination.page - 1) * burgerPagination.pageSize;
    return filteredBurgers.slice(start, start + burgerPagination.pageSize);
  }, [filteredBurgers, burgerPagination]);

  if (loading && !burgers.length) {
    return (
      <LoaderCard
        compact
        title="Cargando catálogo maestro…"
        subtitle="Consultando recetas activas y precios del club."
      />
    );
  }

  return (
    <div className="admin-module-stack">
      <section className="admin-list datatable-section">
        <div className="section-heading admin-section-head">
          <div>
            <div className="datatable-title-row">
              <h2 id="admin-burgers-caption">Productos</h2>
              {refreshing && <Spinner size="sm" label="Actualizando catálogo…" />}
            </div>
          </div>
          <div className="admin-toolbar">
            <button
              type="button"
              className="button small"
              onClick={handleCreateBurger}
              title="Crear nueva hamburguesa para el catálogo"
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
              <span>Nueva hamburguesa</span>
            </button>

            <div className="datatable-controls-right">
              <div className="admin-search-field">
                <label htmlFor="admin-burger-search" className="visually-hidden">
                  Filtrar hamburguesas por nombre o ingrediente
                </label>
                <input
                  id="admin-burger-search"
                  name="burgerSearch"
                  type="search"
                  placeholder="Filtrar por nombre o ingrediente…"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  value={burgerSearch}
                  onChange={e => {
                    setBurgerSearch(e.target.value);
                    setBurgerPage(1);
                  }}
                />
              </div>
              <div className="datatable-pagesize">
                <label htmlFor="admin-burger-pagesize">Filas</label>
                <select
                  id="admin-burger-pagesize"
                  name="burgerPageSize"
                  value={burgerPageSize}
                  onChange={e => {
                    setBurgerPageSize(Number(e.target.value));
                    setBurgerPage(1);
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
                onClick={() => loadBurgers(true)}
                aria-label="Actualizar catálogo de hamburguesas"
              >
                ↻
              </button>
            </div>
          </div>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="admin-burgers-caption"
          className="table-wrap responsive-table-region datatable-wrap rounded-b-none"
        >
          <table className="admin-table burgers-table datatable">
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Ingredientes</th>
                <th scope="col">Precio</th>
                <th scope="col">Estado</th>
                <th scope="col" className="text-center" style={{ minWidth: '270px', width: '270px', maxWidth: '270px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginatedBurgers.map(b => {
                const rowBusy = busyKey === `burger-${b.id}`;
                const deleteBusy = busyKey === `delete-${b.id}`;
                return (
                  <tr key={b.id}>
                    <th scope="row">
                      <div className="burger-row-head">
                        <img src={b.imageUrl || '/assets/hero-burger.jpeg'} alt="" />
                        <div>
                          <strong>{b.name}</strong>
                          <small>ID #{b.id}</small>
                        </div>
                      </div>
                    </th>
                    <td>
                      <div className="meta-chips">
                        {b.ingredients
                          .split(',')
                          .map(i => i.trim())
                          .filter(Boolean)
                          .map(ingredient => (
                            <span key={ingredient} className="meta-chip">
                              {ingredient}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td>
                      <span className="mono-cell price-cell">{formatCop(b.priceCop)}</span>
                    </td>
                    <td>
                      <span className={`status ${b.active ? 'on' : 'off'}`}>
                        {b.active ? 'Visible' : 'Oculta'}
                      </span>
                    </td>
                    <td className="text-center">
                      <div className="admin-table-actions" role="group" aria-label={`Acciones para ${b.name}`}>
                        <button
                          type="button"
                          className="action-btn action-btn-edit"
                          disabled={rowBusy || deleteBusy}
                          onClick={() => handleEditBurger(b)}
                          title={`Editar receta y precio de ${b.name}`}
                          aria-label={`Editar ${b.name}`}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                            <path d="m15 5 4 4"/>
                          </svg>
                          <span>Editar</span>
                        </button>

                        <button
                          type="button"
                          className={`action-btn action-btn-visibility ${b.active ? 'active-state' : 'inactive-state'}`}
                          disabled={rowBusy || deleteBusy}
                          onClick={() => toggleBurgerVisibility(b)}
                          title={b.active ? `Ocultar ${b.name} de los clientes` : `Mostrar ${b.name} a los clientes`}
                          aria-label={b.active ? `Ocultar ${b.name}` : `Mostrar ${b.name}`}
                        >
                          {rowBusy ? (
                            <>
                              <Spinner size="xs" label="Actualizando…" />
                              <span>Actualizando…</span>
                            </>
                          ) : b.active ? (
                            <>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
                                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
                                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
                                <line x1="2" y1="2" x2="22" y2="22"/>
                              </svg>
                              <span>Ocultar</span>
                            </>
                          ) : (
                            <>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                                <circle cx="12" cy="12" r="3"/>
                              </svg>
                              <span>Mostrar</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          className="action-btn action-btn-delete"
                          disabled={rowBusy || deleteBusy}
                          onClick={() => setBurgerToDelete(b)}
                          title={`Eliminar ${b.name} del catálogo`}
                          aria-label={`Eliminar ${b.name}`}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h18"/>
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                            <line x1="10" x2="10" y1="11" y2="17"/>
                            <line x1="14" x2="14" y1="11" y2="17"/>
                          </svg>
                          <span>Eliminar</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!paginatedBurgers.length && (
                <tr>
                  <td colSpan={5} className="empty-table-cell">
                    No hay hamburguesas que coincidan con el filtro actual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <DataTableFooter
          pagination={burgerPagination}
          currentCount={paginatedBurgers.length}
          loading={refreshing}
          onPageChange={setBurgerPage}
          ariaLabel="Paginación de catálogo de hamburguesas"
          itemNoun="recetas"
        />
      </section>

      {/* Modal para Crear y Editar Hamburguesas */}
      <BurgerModal
        open={modalOpen}
        burger={editingBurger}
        onClose={() => setModalOpen(false)}
        onSaved={() => loadBurgers(false)}
      />

      {/* Diálogo de Confirmación para Eliminación */}
      <ConfirmDialog
        open={Boolean(burgerToDelete)}
        title="¿Eliminar esta hamburguesa del catálogo?"
        description="Esta acción retirará inmediatamente la receta del catálogo activo de Secret Bite."
        product={
          burgerToDelete
            ? {
                ...burgerToDelete,
                formattedPrice: formatCop(burgerToDelete.priceCop)
              }
            : null
        }
        confirmLabel="Sí, eliminar producto"
        cancelLabel="Cancelar"
        busy={Boolean(burgerToDelete && busyKey === `delete-${burgerToDelete.id}`)}
        onConfirm={() => burgerToDelete && deleteBurger(burgerToDelete)}
        onCancel={() => setBurgerToDelete(null)}
      />
    </div>
  );
}
