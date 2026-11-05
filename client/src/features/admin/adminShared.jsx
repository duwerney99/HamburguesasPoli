import { useMemo } from 'react';

export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

export const formatCop = value =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(value ?? 0);

export function buildPageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, idx) => idx + 1);
  }
  const pages = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) pages.push('ellipsis-start');
  for (let p = start; p <= end; p += 1) {
    pages.push(p);
  }
  if (end < totalPages - 1) pages.push('ellipsis-end');
  pages.push(totalPages);
  return pages;
}

export function createSortHelpers(sortState, setSortState, setPageState) {
  return {
    toggle(column) {
      setPageState(1);
      setSortState(current => {
        if (current.column === column) {
          return {
            column,
            direction: current.direction === 'asc' ? 'desc' : 'asc'
          };
        }
        return {
          column,
          direction: column === 'id' || column === 'ordersCount' ? 'desc' : 'asc'
        };
      });
    },
    ariaSort(column) {
      if (sortState.column !== column) return 'none';
      return sortState.direction === 'asc' ? 'ascending' : 'descending';
    },
    indicator(column) {
      if (sortState.column !== column) {
        return (
          <span className="datatable-sort-icon muted" aria-hidden="true">
            ↕
          </span>
        );
      }
      return (
        <span className="datatable-sort-icon active" aria-hidden="true">
          {sortState.direction === 'asc' ? '↑' : '↓'}
        </span>
      );
    }
  };
}

export function DataTableFooter({
  pagination,
  currentCount,
  loading = false,
  onPageChange,
  ariaLabel = 'Paginación de tabla',
  itemNoun = 'registros'
}) {
  const rangeStart =
    pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const rangeEnd = Math.min(
    pagination.total,
    (pagination.page - 1) * pagination.pageSize + currentCount
  );
  const pageNumbers = useMemo(
    () => buildPageNumbers(pagination.page, pagination.totalPages),
    [pagination.page, pagination.totalPages]
  );

  return (
    <footer
      className="datatable-footer flex flex-wrap items-center justify-between gap-3.5 bg-surface-elevated px-4 py-3.5"
      aria-label={`Controles de ${ariaLabel.toLowerCase()}`}
    >
      <div className="datatable-status text-xs tabular-nums" role="status" aria-live="polite">
        {pagination.total > 0 ? (
          <>
            Mostrando <strong className="font-mono text-white">{rangeStart}</strong>–
            <strong className="font-mono text-white">{rangeEnd}</strong> de{' '}
            <strong className="font-mono text-white">{pagination.total}</strong> {itemNoun} · Página{' '}
            <strong className="font-mono text-white">{pagination.page}</strong> de{' '}
            <strong className="font-mono text-white">{pagination.totalPages}</strong>
          </>
        ) : (
          `Sin ${itemNoun} para mostrar`
        )}
      </div>

      <nav className="datatable-pagination inline-flex flex-wrap items-center gap-1.5" aria-label={ariaLabel}>
        <button
          type="button"
          className="datatable-page-btn"
          disabled={!pagination.hasPrev || loading}
          onClick={() => onPageChange(1)}
          aria-label="Primera página"
          title="Primera página"
        >
          «
        </button>
        <button
          type="button"
          className="datatable-page-btn datatable-page-nav"
          disabled={!pagination.hasPrev || loading}
          onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
        >
          ‹ Anterior
        </button>

        <div className="datatable-page-numbers">
          {pageNumbers.map(item =>
            typeof item === 'string' ? (
              <span key={item} className="datatable-ellipsis" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={`datatable-page-btn ${item === pagination.page ? 'active' : ''}`}
                aria-current={item === pagination.page ? 'page' : undefined}
                disabled={loading}
                onClick={() => onPageChange(item)}
              >
                {item}
              </button>
            )
          )}
        </div>

        <button
          type="button"
          className="datatable-page-btn datatable-page-nav"
          disabled={!pagination.hasNext || loading}
          onClick={() => onPageChange(Math.min(pagination.totalPages, pagination.page + 1))}
        >
          Siguiente ›
        </button>
        <button
          type="button"
          className="datatable-page-btn"
          disabled={!pagination.hasNext || loading}
          onClick={() => onPageChange(pagination.totalPages)}
          aria-label="Última página"
          title="Última página"
        >
          »
        </button>
      </nav>
    </footer>
  );
}

export function readAndOptimizeImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Selecciona un archivo de imagen válido (JPG, PNG, WEBP o GIF).'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('La imagen supera el tamaño máximo permitido de 5 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No fue posible leer la imagen seleccionada.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        const maxDim = 960;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/webp', 0.85));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

