export function writeAudit(db, { actorUserId = null, action, entityType, entityId = null, metadata = {} }) {
  db.prepare(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
    VALUES(?,?,?,?,?)`).run(actorUserId, action, entityType, entityId == null ? null : String(entityId), JSON.stringify(metadata));
}

export function listAudit(db, limit = 100) {
  return db.prepare(`SELECT a.id,a.action,a.entity_type entityType,a.entity_id entityId,a.metadata,a.created_at createdAt,
    u.name actorName,u.email actorEmail
    FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id
    ORDER BY a.id DESC LIMIT ?`).all(limit).map(row => ({ ...row, metadata: JSON.parse(row.metadata || '{}') }));
}

const SORT_COLUMNS = {
  id: 'a.id',
  createdAt: 'a.id',
  action: 'a.action',
  entityType: 'a.entity_type',
  actorName: "COALESCE(u.name, 'Sistema automático')"
};

export function listAuditPaginated(
  db,
  {
    page = 1,
    pageSize = 10,
    q = '',
    entityType = 'ALL',
    sortBy = 'id',
    sortDir = 'desc'
  } = {}
) {
  const parsedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const parsedPageSize = Math.min(100, Math.max(1, Number.parseInt(pageSize, 10) || 10));
  const search = String(q || '').trim().toLowerCase();
  const normalizedEntity = String(entityType || 'ALL').trim().toUpperCase();
  const orderCol = SORT_COLUMNS[sortBy] || SORT_COLUMNS.id;
  const orderDir = String(sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const clauses = [];
  const params = [];

  if (normalizedEntity && normalizedEntity !== 'ALL') {
    clauses.push('UPPER(a.entity_type) = ?');
    params.push(normalizedEntity);
  }

  if (search) {
    clauses.push(
      `(LOWER(a.action) LIKE ? OR LOWER(a.entity_type) LIKE ? OR LOWER(COALESCE(a.entity_id, '')) LIKE ? OR LOWER(COALESCE(u.name, 'sistema automático')) LIKE ? OR LOWER(COALESCE(u.email, '')) LIKE ? OR LOWER(COALESCE(a.metadata, '')) LIKE ?)`
    );
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const countRow = db
    .prepare(
      `SELECT COUNT(*) total
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ${whereSql}`
    )
    .get(...params);

  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / parsedPageSize));
  const currentPage = Math.min(parsedPage, totalPages);
  const offset = (currentPage - 1) * parsedPageSize;

  const rows = db
    .prepare(
      `SELECT a.id, a.action, a.entity_type entityType, a.entity_id entityId, a.metadata, a.created_at createdAt,
              u.name actorName, u.email actorEmail
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ${whereSql}
       ORDER BY ${orderCol} ${orderDir}, a.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, parsedPageSize, offset);

  const entries = rows.map(row => ({
    ...row,
    metadata: JSON.parse(row.metadata || '{}')
  }));

  return {
    entries,
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
