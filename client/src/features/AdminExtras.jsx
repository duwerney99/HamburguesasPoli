import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const roleLabels = { CLIENT: 'Usuario', CHEF: 'Cocinero / chef', ADMIN: 'Administrador' };

export default function AdminExtras() {
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { const [userData, auditData] = await Promise.all([api('/admin/users'), api('/admin/audit')]); setUsers(userData.users); setAudit(auditData.entries); setError(''); }
    catch (error) { setError(error.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function setRole(id, role) { try { await api(`/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }); await load(); } catch (error) { setError(error.message); } }
  return <>{error && <div className="alert error">{error}</div>}<section className="admin-list"><div className="section-heading"><div><span className="eyebrow">EQUIPO Y CLIENTES</span><h2>Usuarios y roles</h2></div></div><div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td><select value={user.role} onChange={event => setRole(user.id, event.target.value)}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td></tr>)}</tbody></table></div></section>
    <section className="admin-list"><div className="section-heading"><div><span className="eyebrow">TRAZABILIDAD</span><h2>Auditoría reciente</h2></div></div><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Entidad</th></tr></thead><tbody>{audit.slice(0, 20).map(entry => <tr key={entry.id}><td>{new Date(entry.createdAt).toLocaleString('es-CO')}</td><td>{entry.actorName || 'Sistema'}</td><td>{entry.action}</td><td>{entry.entityType} {entry.entityId || ''}</td></tr>)}</tbody></table></div></section></>;
}
