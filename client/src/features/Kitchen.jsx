import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const labels = { PENDING: 'Pendiente', CONFIRMED: 'Confirmado', PREPARING: 'Preparando', READY: 'Listo', DELIVERED: 'Entregado', CANCELLED: 'Cancelado' };

export default function Kitchen() {
  const [data, setData] = useState({ orders: [], transitions: {} });
  const [error, setError] = useState('');
  const load = useCallback(() => api('/kitchen/orders').then(setData).catch(error => setError(error.message)), []);
  useEffect(() => { load(); const id = setInterval(load, 10000); return () => clearInterval(id); }, [load]);
  async function change(id, status) { try { await api(`/kitchen/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }); await load(); } catch (error) { setError(error.message); } }
  return <main className="kitchen-page"><div className="admin-title"><div><span className="eyebrow">COCINA</span><h1>Comandas</h1><p>Pedidos actualizados automáticamente cada 10 segundos.</p></div><button className="button ghost" onClick={load}>Actualizar</button></div>{error && <div className="alert error">{error}</div>}<section className="kitchen-grid">{data.orders.filter(order => !['DELIVERED', 'CANCELLED'].includes(order.status)).map(order => <article className="kitchen-ticket" key={order.id}><header><strong>#{order.id} · {order.customerName}</strong><span className={`status order-${order.status.toLowerCase()}`}>{labels[order.status]}</span></header><small>{order.createdAt} · {order.deliveryAddress}</small>{order.items.map(item => <div className="kitchen-line" key={item.id}><b>{item.quantity} × {item.burgerName}</b><span>{item.ingredients}</span>{item.removedIngredients.length > 0 && <em>RETIRAR: {item.removedIngredients.join(', ')}</em>}{item.notes && <mark>{item.notes}</mark>}</div>)}<div className="ticket-actions">{(data.transitions[order.status] || []).map(next => <button className="button small" key={next} onClick={() => change(order.id, next)}>{labels[next]}</button>)}</div></article>)}</section></main>;
}
