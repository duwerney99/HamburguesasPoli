import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { AlertBanner, LoaderCard, Spinner, useToast } from '../ui/Feedback.jsx';

const money = value =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(value || 0);

const statusLabels = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmado',
  PREPARING: 'En cocina',
  READY: 'Listo',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado'
};

export default function Orders() {
  const [burgers, setBurgers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ phone: '', deliveryAddress: '', notes: '' });
  const [status, setStatus] = useState({
    loading: true,
    busy: false,
    cancellingId: null,
    error: '',
    message: ''
  });
  const { notify } = useToast();

  const load = useCallback(async () => {
    try {
      const [menu, history] = await Promise.all([api('/burgers'), api('/orders/mine')]);
      setBurgers(menu.burgers.filter(item => item.active));
      setOrders(history.orders);
      setStatus(s => ({ ...s, loading: false, error: '' }));
    } catch (error) {
      setStatus(s => ({ ...s, loading: false, error: error.message }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.priceCop * item.quantity, 0),
    [cart]
  );

  function add(burger) {
    setCart(items =>
      items.some(item => item.burgerId === burger.id)
        ? items.map(item =>
            item.burgerId === burger.id
              ? { ...item, quantity: Math.min(10, item.quantity + 1) }
              : item
          )
        : [
            ...items,
            {
              burgerId: burger.id,
              name: burger.name,
              ingredients: burger.ingredients
                .split(',')
                .map(x => x.trim())
                .filter(Boolean),
              removedIngredients: [],
              notes: '',
              quantity: 1,
              priceCop: burger.priceCop
            }
          ]
    );
    notify({
      type: 'info',
      title: 'Agregada a tu pedido',
      message: `${burger.name} lista para personalizar.`
    });
  }

  function update(id, values) {
    setCart(items => items.map(item => (item.burgerId === id ? { ...item, ...values } : item)));
  }

  async function submit(event) {
    event.preventDefault();
    setStatus(s => ({ ...s, busy: true, error: '', message: '' }));
    try {
      await api('/orders', {
        method: 'POST',
        body: JSON.stringify({
          ...customer,
          items: cart.map(({ burgerId, quantity, removedIngredients, notes }) => ({
            burgerId,
            quantity,
            removedIngredients,
            notes
          }))
        })
      });
      setCart([]);
      setCustomer({ phone: '', deliveryAddress: '', notes: '' });
      await load();
      const msg = 'Pedido creado y enviado directamente a cocina.';
      setStatus(s => ({ ...s, busy: false, message: msg }));
      notify({ type: 'success', title: 'Pedido confirmado', message: msg });
    } catch (error) {
      setStatus(s => ({ ...s, busy: false, error: error.message }));
      notify({ type: 'error', title: 'No se pudo enviar el pedido', message: error.message });
    }
  }

  async function cancel(id) {
    setStatus(s => ({ ...s, cancellingId: id, error: '', message: '' }));
    try {
      await api(`/orders/${id}/cancel`, { method: 'PUT' });
      await load();
      const msg = `Pedido #${id} cancelado correctamente.`;
      setStatus(s => ({ ...s, cancellingId: null, message: msg }));
      notify({ type: 'warning', title: 'Pedido cancelado', message: msg });
    } catch (error) {
      setStatus(s => ({ ...s, cancellingId: null, error: error.message }));
      notify({ type: 'error', title: 'No se pudo cancelar el pedido', message: error.message });
    }
  }

  if (status.loading) {
    return (
      <main className="orders-page">
        <LoaderCard
          title="Cargando menú y tus pedidos…"
          subtitle="Preparando recetas activas e historial de órdenes."
        />
      </main>
    );
  }

  return (
    <main className="orders-page">
      <section className="orders-head">
        <span className="eyebrow">PEDIDOS</span>
        <h1>Arma tu pedido</h1>
        <p>Elige hamburguesas, cantidades y los ingredientes que quieres retirar.</p>
      </section>

      <AlertBanner
        type="error"
        title="No fue posible procesar el pedido"
        message={status.error}
        onClose={() => setStatus(s => ({ ...s, error: '' }))}
      />
      <AlertBanner
        type="success"
        title="Estado de tu pedido"
        message={status.message}
        onClose={() => setStatus(s => ({ ...s, message: '' }))}
      />

      <section className="order-layout">
        <div className="order-menu">
          <h2>Menú disponible</h2>
          {burgers.map(burger => (
            <article className="menu-order-card" key={burger.id}>
              <img src={burger.imageUrl || '/assets/hero-burger.jpeg'} alt="" />
              <div>
                <h3>{burger.name}</h3>
                <p>{burger.ingredients}</p>
                <strong>{money(burger.priceCop)}</strong>
              </div>
              <button type="button" className="button small" onClick={() => add(burger)}>
                Agregar
              </button>
            </article>
          ))}
        </div>

        <form className="cart-panel" onSubmit={submit}>
          <h2>Tu pedido</h2>
          {!cart.length && <p className="empty">Aún no agregas hamburguesas.</p>}
          {cart.map(item => (
            <article className="cart-item" key={item.burgerId}>
              <div>
                <strong>{item.name}</strong>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setCart(list => list.filter(x => x.burgerId !== item.burgerId))}
                >
                  Quitar
                </button>
              </div>
              <label>
                Cantidad
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={item.quantity}
                  onChange={e => update(item.burgerId, { quantity: Number(e.target.value) })}
                />
              </label>
              <fieldset>
                <legend>Sin ingredientes</legend>
                {item.ingredients.map(ingredient => (
                  <label className="check" key={ingredient}>
                    <input
                      type="checkbox"
                      checked={item.removedIngredients.includes(ingredient)}
                      onChange={() =>
                        update(item.burgerId, {
                          removedIngredients: item.removedIngredients.includes(ingredient)
                            ? item.removedIngredients.filter(x => x !== ingredient)
                            : [...item.removedIngredients, ingredient]
                        })
                      }
                    />
                    {ingredient}
                  </label>
                ))}
              </fieldset>
              <label>
                Observaciones
                <input
                  value={item.notes}
                  onChange={e => update(item.burgerId, { notes: e.target.value })}
                  placeholder="Ej. bien asada"
                />
              </label>
            </article>
          ))}
          <label>
            Teléfono
            <input
              required
              minLength="7"
              value={customer.phone}
              onChange={e => setCustomer({ ...customer, phone: e.target.value })}
            />
          </label>
          <label>
            Dirección de entrega
            <input
              required
              minLength="8"
              value={customer.deliveryAddress}
              onChange={e => setCustomer({ ...customer, deliveryAddress: e.target.value })}
            />
          </label>
          <label>
            Nota general
            <textarea
              value={customer.notes}
              onChange={e => setCustomer({ ...customer, notes: e.target.value })}
            />
          </label>
          <div className="cart-total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
          <button className="button full" disabled={!cart.length || status.busy}>
            {status.busy ? (
              <>
                <Spinner size="sm" label="Enviando pedido a cocina…" />
                <span>Enviando…</span>
              </>
            ) : (
              'Confirmar pedido'
            )}
          </button>
        </form>
      </section>

      <section className="order-history">
        <h2>Mis pedidos</h2>
        {!orders.length && <p className="empty">Todavía no tienes pedidos.</p>}
        {orders.map(order => {
          const cancellingThis = status.cancellingId === order.id;
          return (
            <article key={order.id}>
              <header>
                <strong>Pedido #{order.id}</strong>
                <span className={`status order-${order.status.toLowerCase()}`}>
                  {statusLabels[order.status]}
                </span>
                <b>{money(order.totalCop)}</b>
              </header>
              <p>
                {order.items
                  .map(
                    item =>
                      `${item.quantity} × ${item.burgerName}${
                        item.removedIngredients.length
                          ? ` (sin ${item.removedIngredients.join(', ')})`
                          : ''
                      }`
                  )
                  .join(' · ')}
              </p>
              {order.status === 'PENDING' && (
                <button
                  type="button"
                  className="text-button inline-busy-btn"
                  disabled={cancellingThis}
                  onClick={() => cancel(order.id)}
                >
                  {cancellingThis ? (
                    <>
                      <Spinner size="sm" label={`Cancelando pedido #${order.id}`} />
                      <span>Cancelando…</span>
                    </>
                  ) : (
                    'Cancelar pedido'
                  )}
                </button>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
