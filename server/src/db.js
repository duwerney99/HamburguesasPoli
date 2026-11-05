import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function createDatabase(filename = ':memory:') {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON;');
  if (filename !== ':memory:') db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'CLIENT' CHECK(role IN ('CLIENT','ADMIN')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS burgers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      ingredients TEXT NOT NULL,
      image_url TEXT NOT NULL DEFAULT '/assets/hero-burger.jpeg',
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      published INTEGER NOT NULL DEFAULT 1 CHECK(published IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(ends_at > starts_at)
    );
    CREATE TABLE IF NOT EXISTS campaign_burgers (
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      burger_id INTEGER NOT NULL REFERENCES burgers(id) ON DELETE RESTRICT,
      PRIMARY KEY(campaign_id, burger_id)
    );
    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      burger_id INTEGER NOT NULL REFERENCES burgers(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 1),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, campaign_id)
    );
    CREATE INDEX IF NOT EXISTS idx_votes_campaign_burger ON votes(campaign_id, burger_id);
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('CLIENT','CHEF','ADMIN'))
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CONFIRMED','PREPARING','READY','DELIVERED','CANCELLED')),
      phone TEXT NOT NULL,
      delivery_address TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      total_cop INTEGER NOT NULL CHECK(total_cop >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      burger_id INTEGER REFERENCES burgers(id) ON DELETE SET NULL,
      burger_name TEXT NOT NULL,
      ingredients_snapshot TEXT NOT NULL,
      removed_ingredients TEXT NOT NULL DEFAULT '[]',
      notes TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_price_cop INTEGER NOT NULL CHECK(unit_price_cop >= 0)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      jti TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id, revoked);
  `);
  const burgerColumns = new Set(db.prepare('PRAGMA table_info(burgers)').all().map(column => column.name));
  if (!burgerColumns.has('price_cop')) db.exec('ALTER TABLE burgers ADD COLUMN price_cop INTEGER NOT NULL DEFAULT 28000;');
  if (!burgerColumns.has('deleted')) db.exec('ALTER TABLE burgers ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;');
  const voteColumns = new Set(db.prepare('PRAGMA table_info(votes)').all().map(column => column.name));
  if (!voteColumns.has('quantity')) db.exec('ALTER TABLE votes ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1;');
  const campaignColumns = new Set(db.prepare('PRAGMA table_info(campaigns)').all().map(column => column.name));
  if (!campaignColumns.has('status')) db.exec("ALTER TABLE campaigns ADD COLUMN status TEXT NOT NULL DEFAULT 'PUBLISHED';");
  if (!campaignColumns.has('winner_burger_id')) db.exec('ALTER TABLE campaigns ADD COLUMN winner_burger_id INTEGER REFERENCES burgers(id);');
  if (!campaignColumns.has('closed_at')) db.exec('ALTER TABLE campaigns ADD COLUMN closed_at TEXT;');
  db.exec(`INSERT OR IGNORE INTO user_roles(user_id,role)
    SELECT id,CASE role WHEN 'ADMIN' THEN 'ADMIN' ELSE 'CLIENT' END FROM users;`);
  // Sanea campañas duplicadas heredadas del MVP inicial sin tocar campañas que ya tengan votos.
  const legacyActive = db.prepare(`SELECT c.id FROM campaigns c
    WHERE c.status='PUBLISHED' AND c.published=1 AND c.starts_at<=? AND c.ends_at>?
    ORDER BY c.starts_at DESC,c.id DESC`).all(new Date().toISOString(), new Date().toISOString());
  for (const { id } of legacyActive.slice(1)) {
    const votes = db.prepare('SELECT COUNT(*) total FROM votes WHERE campaign_id=?').get(id).total;
    if (!votes) db.prepare("UPDATE campaigns SET status='DRAFT',published=0 WHERE id=?").run(id);
  }
  return db;
}

function closeExpiredCampaigns(db) {
  const expired = db.prepare("SELECT id FROM campaigns WHERE status='PUBLISHED' AND ends_at<=?").all(new Date().toISOString());
  for (const { id } of expired) {
    const winner = db.prepare(`SELECT cb.burger_id burgerId,COUNT(v.id) votes FROM campaign_burgers cb
      LEFT JOIN votes v ON v.campaign_id=cb.campaign_id AND v.burger_id=cb.burger_id
      WHERE cb.campaign_id=? GROUP BY cb.burger_id ORDER BY votes DESC,cb.burger_id LIMIT 1`).get(id);
    db.prepare("UPDATE campaigns SET status='CLOSED',published=0,winner_burger_id=?,closed_at=CURRENT_TIMESTAMP WHERE id=?").run(winner?.burgerId ?? null, id);
  }
}

export function campaignStatus(campaign, now = new Date()) {
  if (campaign.status === 'CANCELLED' || campaign.status === 'CLOSED' || campaign.status === 'DRAFT') return campaign.status;
  const instant = now.getTime();
  if (instant < Date.parse(campaign.startsAt)) return 'SCHEDULED';
  if (instant >= Date.parse(campaign.endsAt)) return 'CLOSED';
  return 'ACTIVE';
}

export function getCampaign(db, id, userId) {
  const row = db.prepare(`SELECT id,name,starts_at startsAt,ends_at endsAt,published,status,winner_burger_id winnerBurgerId,closed_at closedAt FROM campaigns WHERE id=?`).get(id);
  if (!row) return null;
  const computedStatus = campaignStatus(row);
  const candidates = db.prepare(`
    SELECT b.id, b.name, b.description, b.ingredients, b.image_url imageUrl, b.price_cop priceCop, b.active, b.deleted,
           COUNT(v.id) voteCount,
           COALESCE(SUM(v.quantity), 0) desiredQuantity
    FROM campaign_burgers cb JOIN burgers b ON b.id = cb.burger_id
    LEFT JOIN votes v ON v.campaign_id = cb.campaign_id AND v.burger_id = b.id
    WHERE cb.campaign_id = ? AND b.deleted = 0 AND (b.active = 1 OR ? = 'CLOSED')
    GROUP BY b.id ORDER BY voteCount DESC, desiredQuantity DESC, b.id
  `).all(id, computedStatus).map(candidate => ({
    ...candidate,
    active: Boolean(candidate.active),
    deleted: Boolean(candidate.deleted),
    voteCount: Number(candidate.voteCount || 0),
    desiredQuantity: Number(candidate.desiredQuantity || 0)
  }));
  const ownVote = userId
    ? db.prepare('SELECT burger_id burgerId, quantity FROM votes WHERE campaign_id = ? AND user_id = ?').get(id, userId)
    : null;
  return {
    ...row,
    published: Boolean(row.published),
    lifecycleStatus: row.status,
    status: computedStatus,
    candidates,
    userVoteBurgerId: ownVote?.burgerId ?? null,
    userVoteQuantity: ownVote?.quantity != null ? Number(ownVote.quantity) : null
  };
}

export function listCampaigns(db, userId) {
  closeExpiredCampaigns(db);
  return db.prepare('SELECT id FROM campaigns ORDER BY starts_at DESC').all().map(({ id }) => getCampaign(db, id, userId));
}
