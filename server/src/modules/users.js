import { z } from 'zod';
import { writeAudit } from './audit.js';

const roles = ['CLIENT', 'CHEF', 'ADMIN'];

export function userWithRole(db, where, value) {
  return db.prepare(`SELECT u.*,COALESCE(ur.role,u.role) app_role
    FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id WHERE ${where}`).get(value);
}

export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.app_role || user.role };
}

export function installUserRoutes(app, { db, requireAuth, requireRole, parse }) {
  app.get('/api/admin/users', requireAuth, requireRole('ADMIN'), (_req, res) => {
    const users = db.prepare(`SELECT u.id,u.name,u.email,COALESCE(ur.role,u.role) role,u.created_at createdAt
      FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id ORDER BY u.id DESC`).all();
    res.json({ users, roles });
  });

  app.put('/api/admin/users/:id/role', requireAuth, requireRole('ADMIN'), (req, res) => {
    const data = parse(z.object({ role: z.enum(roles) }), req.body, res);
    if (!data) return;
    const userId = Number(req.params.id);
    if (userId === Number(req.auth.sub) && data.role !== 'ADMIN') return res.status(409).json({ error: 'No puedes retirar tu propio rol de administrador.' });
    const user = db.prepare('SELECT id FROM users WHERE id=?').get(userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    db.prepare(`INSERT INTO user_roles(user_id,role) VALUES(?,?)
      ON CONFLICT(user_id) DO UPDATE SET role=excluded.role`).run(userId, data.role);
    writeAudit(db, { actorUserId: Number(req.auth.sub), action: 'USER_ROLE_CHANGED', entityType: 'USER', entityId: userId, metadata: { role: data.role } });
    res.json({ user: publicUser(userWithRole(db, 'u.id=?', userId)) });
  });
}
