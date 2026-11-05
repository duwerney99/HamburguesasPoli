import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { AlertBanner, ConfirmDialog, LoaderCard, Spinner, useToast } from '../../ui/Feedback.jsx';
import {
  DataTableFooter,
  formatCop,
  PAGE_SIZE_OPTIONS,
  readAndOptimizeImage
} from './adminShared.jsx';

export function BurgerForm({ onSaved }) {
  const initial = {
    name: '',
    description: '',
    ingredients: '',
    imageUrl: '/assets/hero-burger.jpeg',
    priceCop: 28000,
    active: true
  };
  const [form, setForm] = useState(initial);
  const [fileMeta, setFileMeta] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { notify } = useToast();

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
    setForm(prev => ({ ...prev, imageUrl: initial.imageUrl }));
    setFileMeta(null);
  }

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api('/burgers', { method: 'POST', body: JSON.stringify(form) });
      setForm(initial);
      setFileMeta(null);
      onSaved('Hamburguesa creada e incorporada al catálogo.');
    } catch (err) {
      setError(err.message);
      notify({ type: 'error', title: 'Error al guardar hamburguesa', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="admin-form" method="post" onSubmit={submit}>
      <div className="admin-form-header">
        <div>
          <span className="eyebrow">RECETA DE AUTOR</span>
          <h3>Nueva hamburguesa</h3>
        </div>
        <span className="price-preview-badge">{formatCop(form.priceCop)}</span>
      </div>
      <label>
        Nombre de la burger
        <input
          name="burgerName"
          required
          minLength="2"
          placeholder="Ej. Smoky Bourbon Melt"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
        />
      </label>
      <label>
        Descripción gastronómica
        <textarea
          name="burgerDescription"
          required
          minLength="10"
          placeholder="Describe el perfil de sabor, punto de cocción y textura..."
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
        />
      </label>
      <label>
        Ingredientes separados por coma
        <textarea
          name="burgerIngredients"
          required
          placeholder="Carne Angus, cheddar madurado, tocineta ahumada..."
          value={form.ingredients}
          onChange={e => setForm({ ...form, ingredients: e.target.value })}
        />
      </label>
      <label>
        Precio COP
        <input
          name="priceCop"
          type="number"
          min="1000"
          required
          value={form.priceCop}
          onChange={e => setForm({ ...form, priceCop: Number(e.target.value) })}
        />
      </label>

      <div
        className={`image-upload-zone ${dragActive ? 'drag-over' : ''}`}
        onDragOver={e => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <div className="image-upload-preview">
          <img src={form.imageUrl} alt="Vista previa de la hamburguesa" />
          <div className="image-upload-meta">
            <strong>
              {optimizing
                ? 'Optimizando fotografía…'
                : fileMeta
                  ? fileMeta.name
                  : 'Imagen predeterminada del club'}
            </strong>
            <small>
              {optimizing
                ? 'Ajustando dimensiones y compresión WebP'
                : fileMeta
                  ? `${fileMeta.sizeKb} KB · Optimizada automáticamente`
                  : 'Sube una foto en JPG, PNG o WEBP (máx. 5 MB)'}
            </small>
          </div>
          {optimizing ? (
            <Spinner size="sm" label="Optimizando fotografía…" />
          ) : (
            fileMeta && (
              <button type="button" className="text-button" onClick={clearImage}>
                Quitar
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
      <button type="submit" className="button full" disabled={submitting || optimizing}>
        {submitting ? (
          <>
            <Spinner size="sm" label="Guardando hamburguesa en catálogo…" />
            <span>Guardando hamburguesa…</span>
          </>
        ) : (
          'Guardar hamburguesa en catálogo'
        )}
      </button>
    </form>
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
      <section className="admin-single-form-wrap">
        <BurgerForm onSaved={() => loadBurgers(false)} />
      </section>

      <section className="admin-list datatable-section">
        <div className="section-heading admin-section-head">
          <div>
            <span className="eyebrow">CATÁLOGO MAESTRO · DATATABLE</span>
            <div className="datatable-title-row">
              <h2 id="admin-burgers-caption">Hamburguesas</h2>
              <span className="datatable-total-pill">
                {filteredBurgers.length} {filteredBurgers.length === 1 ? 'receta' : 'recetas'}
              </span>
              {refreshing && <Spinner size="sm" label="Actualizando catálogo…" />}
            </div>
            <p className="admin-section-sub">
              Activa, desactiva o elimina productos para el menú de pedidos y próximas convocatorias de votación.
            </p>
          </div>
          <div className="admin-toolbar">
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
          className="table-wrap responsive-table-region datatable-wrap"
        >
          <table className="admin-table burgers-table datatable">
            <thead>
              <tr>
                <th scope="col">Hamburguesa</th>
                <th scope="col">Ingredientes</th>
                <th scope="col">Precio</th>
                <th scope="col">Estado</th>
                <th scope="col">Acción</th>
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
                    <td>
                      <div className="row-actions-group">
                        <button
                          type="button"
                          className="text-button inline-busy-btn"
                          disabled={rowBusy || deleteBusy}
                          onClick={() => toggleBurgerVisibility(b)}
                        >
                          {rowBusy ? (
                            <>
                              <Spinner size="sm" label="Actualizando visibilidad…" />
                              <span>Actualizando…</span>
                            </>
                          ) : b.active ? (
                            'Ocultar'
                          ) : (
                            'Mostrar'
                          )}
                        </button>

                        <button
                          type="button"
                          className="text-button danger-text-btn"
                          disabled={rowBusy || deleteBusy}
                          onClick={() => setBurgerToDelete(b)}
                        >
                          Eliminar
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

