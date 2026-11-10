import { toBurgerProjection } from '../../domain/burger.projections.js';

/**
 * INFRASTRUCTURE OUTBOUND ADAPTER (SQLite): Burgers Repository
 */
export function createBurgersSqliteAdapter(db) {
  return {
    async list({ includeInactive = false } = {}) {
      const rows = db
        .prepare(
          `SELECT id,name,description,ingredients,price_cop priceCop,image_url imageUrl,active,deleted_at deletedAt
           FROM burgers
           ${includeInactive ? 'WHERE deleted_at IS NULL' : 'WHERE active=1 AND deleted_at IS NULL'}
           ORDER BY id DESC`
        )
        .all();
      return rows.map(toBurgerProjection);
    },

    async findById(id) {
      const row = db
        .prepare(
          `SELECT id,name,description,ingredients,price_cop priceCop,image_url imageUrl,active,deleted_at deletedAt
           FROM burgers WHERE id=? AND deleted_at IS NULL`
        )
        .get(Number(id));
      return toBurgerProjection(row);
    },

    async create({ name, description, ingredients, priceCop = 28000, imageUrl, active = true }) {
      const result = db
        .prepare(
          'INSERT INTO burgers(name,description,ingredients,price_cop,image_url,active) VALUES(?,?,?,?,?,?)'
        )
        .run(name, description, ingredients, Number(priceCop), imageUrl, active ? 1 : 0);
      return this.findById(Number(result.lastInsertRowid));
    },

    async update(id, { name, description, ingredients, priceCop = 28000, imageUrl, active = true }) {
      const numericId = Number(id);
      const exists = await this.findById(numericId);
      if (!exists) return null;
      db.prepare(
        `UPDATE burgers SET name=?,description=?,ingredients=?,price_cop=?,image_url=?,active=?
         WHERE id=? AND deleted_at IS NULL`
      ).run(name, description, ingredients, Number(priceCop), imageUrl, active ? 1 : 0, numericId);
      return this.findById(numericId);
    },

    async softDelete(id) {
      const numericId = Number(id);
      const exists = await this.findById(numericId);
      if (!exists) return false;
      db.prepare('UPDATE burgers SET active=0,deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(numericId);
      return true;
    }
  };
}

