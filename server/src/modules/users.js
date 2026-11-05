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

const USER_SORT_COLUMNS = {
  id: 'u.id',
  createdAt: 'u.id',
  name: 'LOWER(u.name)',
  email: 'LOWER(u.email)',
  role: 'COALESCE(ur.role, u.role)',
  votesCount: 'votesCount',
  ordersCount: 'ordersCount'
};

export function listUsersPaginated(
  db,
  {
    page = 1,
    pageSize = 10,
    q = '',
    scope = 'ALL',
    role = 'ALL',
    sortBy = 'id',
    sortDir = 'desc'
  } = {}
) {
  const parsedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const parsedPageSize = Math.min(100, Math.max(1, Number.parseInt(pageSize, 10) || 10));
  const search = String(q || '').trim().toLowerCase();
  const normalizedScope = String(scope || 'ALL').trim().toUpperCase();
  const normalizedRole = String(role || 'ALL').trim().toUpperCase();
  const orderCol = USER_SORT_COLUMNS[sortBy] || USER_SORT_COLUMNS.id;
  const orderDir = String(sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const clauses = [];
  const params = [];

  if (normalizedScope === 'STAFF') {
    clauses.push("COALESCE(ur.role, u.role) IN ('ADMIN', 'CHEF')");
    if (normalizedRole === 'ADMIN' || normalizedRole === 'CHEF') {
      clauses.push('COALESCE(ur.role, u.role) = ?');
      params.push(normalizedRole);
    }
  } else if (normalizedScope === 'CLIENTS') {
    clauses.push("COALESCE(ur.role, u.role) = 'CLIENT'");
  } else if (normalizedRole && normalizedRole !== 'ALL') {
    clauses.push('COALESCE(ur.role, u.role) = ?');
    params.push(normalizedRole);
  }

  if (search) {
    clauses.push(
      '(LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ? OR CAST(u.id AS TEXT) LIKE ?)'
    );
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const countRow = db
    .prepare(
      `SELECT COUNT(*) total
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       ${whereSql}`
    )
    .get(...params);

  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / parsedPageSize));
  const currentPage = Math.min(parsedPage, totalPages);
  const offset = (currentPage - 1) * parsedPageSize;

  const users = db
    .prepare(
      `SELECT u.id,
              u.name,
              u.email,
              COALESCE(ur.role, u.role) role,
              u.created_at createdAt,
              (SELECT COUNT(*) FROM votes v WHERE v.user_id = u.id) votesCount,
              (SELECT COALESCE(SUM(v.quantity), 0) FROM votes v WHERE v.user_id = u.id) desiredBurgersCount,
              (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) ordersCount
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       ${whereSql}
       ORDER BY ${orderCol} ${orderDir}, u.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, parsedPageSize, offset);

  const roleSummaryRows = db
    .prepare(
      `SELECT COALESCE(ur.role, u.role) role, COUNT(*) total
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       GROUP BY COALESCE(ur.role, u.role)`
    )
    .all();

  const counts = { ALL: 0, STAFF: 0, ADMIN: 0, CHEF: 0, CLIENT: 0 };
  for (const row of roleSummaryRows) {
    const count = Number(row.total || 0);
    counts[row.role] = count;
    counts.ALL += count;
    if (row.role === 'ADMIN' || row.role === 'CHEF') {
      counts.STAFF += count;
    }
  }

  return {
    users,
    roles,
    counts,
    pagination: {
      page: currentPage,
      pageSize: parsedPageSize,
      total,
      totalPages,
      hasPrev: currentPage > 1,
      hasNext: currentPage < totalPages
    }
  };
}

export function installUserRoutes(app, { db, requireAuth, requireRole, parse }) {
  app.get('/api/admin/users', requireAuth, requireRole('ADMIN'), (req, res) => {
    const result = listUsersPaginated(db, {
      page: req.query.page ?? 1,
      pageSize: req.query.pageSize ?? 10,
      q: req.query.q ?? '',
      scope: req.query.scope ?? 'ALL',
      role: req.query.role ?? 'ALL',
      sortBy: req.query.sortBy ?? 'id',
      sortDir: req.query.sortDir ?? 'desc'
    });
    res.json(result);
  });

  app.get('/api/admin/clients', requireAuth, requireRole('ADMIN'), (req, res) => {
    const result = listUsersPaginated(db, {
      page: req.query.page ?? 1,
      pageSize: req.query.pageSize ?? 10,
      q: req.query.q ?? '',
      scope: 'CLIENTS',
      role: 'CLIENT',
      sortBy: req.query.sortBy ?? 'id',
      sortDir: req.query.sortDir ?? 'desc'
    });
    res.json({
      clients: result.users,
      users: result.users,
      counts: result.counts,
      pagination: result.pagination
    });
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
