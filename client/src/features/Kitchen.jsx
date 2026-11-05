import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { AlertBanner, LoaderCard, Spinner, useToast } from '../ui/Feedback.jsx';

const labels = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Preparando',
  READY: 'Listo',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado'
};

export default function Kitchen() {
  const [data, setData] = useState({ orders: [], transitions: {} });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { notify } = useToast();

  const load = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const response = await api('/kitchen/orders');
      setData(response);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const id = setInterval(() => load(false), 10000);
    return () => clearInterval(id);
  }, [load]);

  async function change(id, nextStatus) {
    const key = `${id}-${nextStatus}`;
    setBusyKey(key);
    setError('');
    try {
      await api(`/kitchen/orders/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus })
      });
      await load(false);
      const msg = `Comanda #${id} avanzada a "${labels[nextStatus] || nextStatus}".`;
      setNotice(msg);
      notify({
        type: 'success',
        title: 'Comanda actualizada',
        message: msg
      });
    } catch (err) {
      setError(err.message);
      notify({
        type: 'error',
        title: 'Error en cocina',
        message: err.message
      });
    } finally {
      setBusyKey('');
    }
  }

  const activeOrders = data.orders.filter(
    order => !['DELIVERED', 'CANCELLED'].includes(order.status)
  );

  return (
    <main className="kitchen-page">
      <div className="admin-title">
        <div>
          <span className="eyebrow">COCINA</span>
          <h1>Comandas</h1>
          <p>Pedidos actualizados automáticamente cada 10 segundos.</p>
        </div>
        <button
          type="button"
          className="button ghost"
          disabled={refreshing}
          onClick={() => load(true)}
        >
          {refreshing ? (
            <>
              <Spinner size="sm" label="Actualizando comandas…" />
              <span>Actualizando…</span>
            </>
          ) : (
            '↻ Actualizar'
          )}
        </button>
      </div>

      <AlertBanner
        type="error"
        title="No se pudo actualizar la comanda"
        message={error}
        onClose={() => setError('')}
      />
      <AlertBanner
        type="success"
        title="Movimiento en parrilla"
        message={notice}
        onClose={() => setNotice('')}
      />

      {loading ? (
        <LoaderCard
          title="Cargando comandas de cocina…"
          subtitle="Conectando con el tablero de órdenes en tiempo real."
        />
      ) : (
        <section className="kitchen-grid">
          {!activeOrders.length && (
            <p className="empty">No hay comandas pendientes en este momento.</p>
          )}
          {activeOrders.map(order => (
            <article className="kitchen-ticket" key={order.id}>
              <header>
                <strong>
                  #{order.id} · {order.customerName}
                </strong>
                <span className={`status order-${order.status.toLowerCase()}`}>
                  {labels[order.status]}
                </span>
              </header>
              <small>
                {order.createdAt} · {order.deliveryAddress}
              </small>
              {order.items.map(item => (
                <div className="kitchen-line" key={item.id}>
                  <b>
                    {item.quantity} × {item.burgerName}
                  </b>
                  <span>{item.ingredients}</span>
                  {item.removedIngredients.length > 0 && (
                    <em>RETIRAR: {item.removedIngredients.join(', ')}</em>
                  )}
                  {item.notes && <mark>{item.notes}</mark>}
                </div>
              ))}
              <div className="ticket-actions">
                {(data.transitions[order.status] || []).map(next => {
                  const isBusy = busyKey === `${order.id}-${next}`;
                  return (
                    <button
                      type="button"
                      className="button small"
                      key={next}
                      disabled={Boolean(busyKey)}
                      onClick={() => change(order.id, next)}
                    >
                      {isBusy ? (
                        <>
                          <Spinner size="sm" label={`Cambiando a ${labels[next]}`} />
                          <span>{labels[next]}…</span>
                        </>
                      ) : (
                        labels[next]
                      )}
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
