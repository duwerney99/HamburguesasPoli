import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';

const ToastContext = createContext({
  notify: () => {},
  dismiss: () => {}
});

const ICONS = {
  success: '✓',
  error: '!',
  warning: '⚠',
  info: 'i'
};

const DEFAULT_TITLES = {
  success: 'Operación completada',
  error: 'Atención requerida',
  warning: 'Aviso operativo',
  info: 'Información'
};

export function Spinner({ label = 'Cargando…', size = 'md', className = '' }) {
  const classes = ['loading-spinner', size !== 'md' ? `spinner-${size}` : '', className]
    .filter(Boolean)
    .join(' ');
  return <progress aria-label={label} className={classes} />;
}

export function LoaderCard({
  title = 'Cargando…',
  subtitle = 'Sincronizando información con el servidor de Secret Bite.',
  compact = false
}) {
  return (
    <div className={`loader-card ${compact ? 'loader-compact' : ''}`}>
      <Spinner label={title} size={compact ? 'md' : 'lg'} />
      <div className="loader-copy">
        <strong>{title}</strong>
        {subtitle && <small>{subtitle}</small>}
      </div>
    </div>
  );
}

export function AlertBanner({ type = 'info', title, message, onClose }) {
  if (!message) return null;
  const isError = type === 'error';
  const resolvedTitle = title || DEFAULT_TITLES[type] || DEFAULT_TITLES.info;

  return (
    <div className={`alert ${type}`} role={isError ? 'alert' : 'status'}>
      <span className="alert-icon" aria-hidden="true">
        {ICONS[type] || ICONS.info}
      </span>
      <div className="alert-body">
        <strong className="alert-title">{resolvedTitle}</strong>
        <span className="alert-text">{message}</span>
      </div>
      {onClose && (
        <button
          type="button"
          className="alert-close"
          aria-label="Cerrar alerta"
          onClick={onClose}
        >
          ×
        </button>
      )}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback(id => {
    setToasts(current => current.filter(item => item.id !== id));
  }, []);

  const notify = useCallback(({ type = 'info', title, message, duration = 4800 }) => {
    if (!message) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(current => [
      ...current.slice(-3),
      {
        id,
        type,
        title: title || DEFAULT_TITLES[type] || DEFAULT_TITLES.info,
        message,
        duration
      }
    ]);
  }, []);

  return (
    <ToastContext.Provider value={{ notify, dismiss }}>
      {children}
      <aside className="toast-viewport" aria-label="Notificaciones del sistema">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </aside>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast.duration) return undefined;
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const isError = toast.type === 'error';

  return (
    <div className={`toast-item ${toast.type}`} role={isError ? 'alert' : 'status'}>
      <span className="alert-icon" aria-hidden="true">
        {ICONS[toast.type] || ICONS.info}
      </span>
      <div className="alert-body">
        <strong className="alert-title">{toast.title}</strong>
        <span className="alert-text">{toast.message}</span>
      </div>
      <button
        type="button"
        className="alert-close"
        aria-label="Cerrar notificación"
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
    </div>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function ConfirmDialog({
  open,
  title = '¿Confirmar eliminación?',
  description,
  product,
  confirmLabel = 'Eliminar producto',
  cancelLabel = 'Cancelar',
  busy = false,
  onConfirm,
  onCancel
}) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const descId = useId();

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

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      let downOutside = false;

      const onPointerDown = event => {
        const rect = dialog.getBoundingClientRect();
        downOutside =
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom;
      };

      const onPointerUp = event => {
        if (!downOutside || busy) return;
        const rect = dialog.getBoundingClientRect();
        const upOutside =
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom;
        if (upOutside) {
          dialog.close('dismiss');
        }
      };

      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
      return () => {
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      };
    }

    return undefined;
  }, [open, busy]);

  function handleNativeCancel(event) {
    if (busy) {
      event.preventDefault();
    }
  }

  function handleNativeClose() {
    if (open && !busy && onCancel) {
      onCancel();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      closedby="any"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onCancel={handleNativeCancel}
      onClose={handleNativeClose}
    >
      <div className="confirm-dialog-surface">
        <header className="confirm-dialog-head">
          <div className="confirm-dialog-badge" aria-hidden="true">
            <span>!</span>
          </div>
          <div className="confirm-dialog-titles">
            <span className="eyebrow">ACCIÓN DE CATÁLOGO · CONFIRMACIÓN</span>
            <h3 id={titleId}>{title}</h3>
          </div>
          <button
            type="button"
            className="alert-close confirm-dialog-close"
            aria-label="Cerrar ventana de confirmación"
            disabled={busy}
            onClick={onCancel}
          >
            ×
          </button>
        </header>

        {product && (
          <div className="confirm-dialog-product flex items-center gap-4 rounded-xl border border-surface-line-strong bg-surface-card/80 p-3.5">
            <img
              src={product.imageUrl || '/assets/hero-burger.jpeg'}
              alt={product.name}
              className="confirm-dialog-thumb shrink-0 rounded-lg object-cover"
            />
            <div className="confirm-dialog-product-meta min-w-0 flex-1 flex flex-col gap-1">
              <div className="confirm-dialog-product-top flex items-center justify-between gap-2">
                <strong className="truncate text-white font-semibold">{product.name}</strong>
                <span className="entity-pill font-mono text-xs">ID #{product.id}</span>
              </div>
              {product.ingredients && (
                <p className="confirm-dialog-ingredients text-xs">{product.ingredients}</p>
              )}
              {product.formattedPrice && (
                <span className="confirm-dialog-price font-mono text-xs font-bold text-brand-amber">
                  {product.formattedPrice}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="confirm-dialog-warning">
          <p id={descId} className="confirm-dialog-desc">
            {description}
          </p>
          <ul className="confirm-dialog-checklist">
            <li>Dejará de aparecer en el menú de pedidos de los clientes.</li>
            <li>No estará visible en la urna de votación activa ni en próximas convocatorias.</li>
            <li>Se conservará el historial de auditoría y métricas pasadas si tuvo votos previos.</li>
          </ul>
        </div>

        <footer className="confirm-dialog-actions">
          <button
            type="button"
            className="button ghost"
            autoFocus
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="button danger-solid-btn"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? (
              <>
                <Spinner size="sm" label="Eliminando producto…" />
                <span>Eliminando producto…</span>
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </footer>
      </div>
    </dialog>
  );
}

