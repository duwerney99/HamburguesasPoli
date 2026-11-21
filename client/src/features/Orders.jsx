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
  const [campaign, setCampaign] = useState(null);
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ phone: '', deliveryAddress: '', notes: '' });
  const [touched, setTouched] = useState({ phone: false, deliveryAddress: false });
  const [status, setStatus] = useState({
    loading: true,
    busy: false,
    cancellingId: null,
    error: '',
    message: ''
  });
  const { notify } = useToast();

  const fieldErrors = useMemo(() => {
    const errors = {};
    const phone = customer.phone.trim();
    if (!phone) {
      errors.phone = 'El teléfono de contacto es obligatorio.';
    } else if (phone.length < 7) {
      errors.phone = `Ingresa al menos 7 dígitos para el teléfono (llevas ${phone.length}/7).`;
    }

    const address = customer.deliveryAddress.trim();
    if (!address) {
      errors.deliveryAddress = 'La dirección de entrega es obligatoria.';
    } else if (address.length < 8) {
      errors.deliveryAddress = `Ingresa una dirección completa de mínimo 8 caracteres (llevas ${address.length}/8).`;
    }

    if (cart.length === 0) {
      errors.cart = 'Agrega al menos una hamburguesa a tu pedido.';
    }
    return errors;
  }, [customer.phone, customer.deliveryAddress, cart.length]);

  const isOrderFormValid = Object.keys(fieldErrors).length === 0;

  const load = useCallback(async () => {
    try {
      const [activeCampaign, history] = await Promise.all([
        api('/campaigns/active'),
        api('/orders/mine')
      ]);
      const currentCampaign = activeCampaign.campaign;
      const votedBurger = (currentCampaign.candidates || []).find(
        item => String(item.id) === String(currentCampaign.userVoteBurgerId)
      );
      setCampaign(currentCampaign);
      setBurgers(
        votedBurger
          ? [{ ...votedBurger, votedQuantity: Number(currentCampaign.userVoteQuantity || 1) }]
          : []
      );
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
              quantity: Math.min(10, Math.max(1, Number(burger.votedQuantity || 1))),
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
    setTouched({ phone: true, deliveryAddress: true });
    if (!isOrderFormValid) {
      const firstError =
        fieldErrors.cart || fieldErrors.phone || fieldErrors.deliveryAddress;
      setStatus(s => ({ ...s, error: firstError }));
      return;
    }
    setStatus(s => ({ ...s, busy: true, error: '', message: '' }));
    try {
      await api('/orders', {
        method: 'POST',
        body: JSON.stringify({
          phone: customer.phone.trim(),
          deliveryAddress: customer.deliveryAddress.trim(),
          notes: customer.notes.trim(),
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
      setTouched({ phone: false, deliveryAddress: false });
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
          <h2>Tu hamburguesa votada</h2>
          {!campaign?.userVoteBurgerId && (
            <p className="empty">Primero debes votar en la campaña activa para habilitar tu hamburguesa.</p>
          )}
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
          <div className="auth-field">
            <div className="form-field-head">
              <label htmlFor="order-phone">
                Teléfono <span className="required-mark">*</span>
              </label>
              <small className="field-hint">Mín. 7 dígitos</small>
            </div>
            <input
              id="order-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="Ej. 300 123 4567"
              required
              minLength="7"
              aria-invalid={touched.phone && Boolean(fieldErrors.phone) ? 'true' : 'false'}
              aria-describedby={touched.phone && fieldErrors.phone ? 'order-phone-error' : undefined}
              className={
                touched.phone
                  ? fieldErrors.phone
                    ? 'input-mismatch'
                    : 'input-confirmed'
                  : ''
              }
              value={customer.phone}
              onChange={e => setCustomer({ ...customer, phone: e.target.value })}
              onBlur={() => setTouched(prev => ({ ...prev, phone: true }))}
            />
            {touched.phone && fieldErrors.phone && (
              <div id="order-phone-error" className="auth-field-feedback error">
                <span role="img" aria-label="Error">
                  ✕
                </span>{' '}
                {fieldErrors.phone}
              </div>
            )}
          </div>

          <div className="auth-field">
            <div className="form-field-head">
              <label htmlFor="order-address">
                Dirección de entrega <span className="required-mark">*</span>
              </label>
              <small className="field-hint">Mín. 8 caracteres</small>
            </div>
            <input
              id="order-address"
              name="deliveryAddress"
              type="text"
              autoComplete="street-address"
              placeholder="Ej. Cra 43A # 10-50, El Poblado"
              required
              minLength="8"
              aria-invalid={
                touched.deliveryAddress && Boolean(fieldErrors.deliveryAddress) ? 'true' : 'false'
              }
              aria-describedby={
                touched.deliveryAddress && fieldErrors.deliveryAddress
                  ? 'order-address-error'
                  : undefined
              }
              className={
                touched.deliveryAddress
                  ? fieldErrors.deliveryAddress
                    ? 'input-mismatch'
                    : 'input-confirmed'
                  : ''
              }
              value={customer.deliveryAddress}
              onChange={e => setCustomer({ ...customer, deliveryAddress: e.target.value })}
              onBlur={() => setTouched(prev => ({ ...prev, deliveryAddress: true }))}
            />
            {touched.deliveryAddress && fieldErrors.deliveryAddress && (
              <div id="order-address-error" className="auth-field-feedback error">
                <span role="img" aria-label="Error">
                  ✕
                </span>{' '}
                {fieldErrors.deliveryAddress}
              </div>
            )}
          </div>

          <div className="auth-field">
            <div className="form-field-head">
              <label htmlFor="order-notes">Nota general</label>
              <small className="field-hint">Opcional</small>
            </div>
            <textarea
              id="order-notes"
              name="notes"
              placeholder="Portería, piso o indicaciones de entrega…"
              value={customer.notes}
              onChange={e => setCustomer({ ...customer, notes: e.target.value })}
            />
          </div>

          <div className="cart-total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>

          {!isOrderFormValid && (
            <p className="form-required-hint" role="status">
              {fieldErrors.cart
                ? 'Agrega tu hamburguesa y completa Teléfono (*) y Dirección (*).'
                : 'Diligencia los campos obligatorios (*) para habilitar la confirmación.'}
            </p>
          )}

          <button
            type="submit"
            className="button full"
            disabled={!isOrderFormValid || status.busy}
          >
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
