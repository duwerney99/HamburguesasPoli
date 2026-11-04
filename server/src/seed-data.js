import bcrypt from 'bcryptjs';

export function seedDatabase(db) {
  const upsertUser = db.prepare(`INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET name=excluded.name,password_hash=excluded.password_hash,role=excluded.role`);
  upsertUser.run('Administrador Secret Bite', 'admin@secretbite.co', bcrypt.hashSync('Admin123!', 10), 'ADMIN');
  upsertUser.run('Cliente Demo', 'cliente@secretbite.co', bcrypt.hashSync('Cliente123!', 10), 'CLIENT');
  // La tabla user_roles amplía los roles sin romper bases creadas con el esquema inicial.
  upsertUser.run('Chef Demo', 'chef@secretbite.co', bcrypt.hashSync('Chef123!', 10), 'CLIENT');
  const setRole = db.prepare(`INSERT INTO user_roles(user_id,role)
    SELECT id,? FROM users WHERE email=? ON CONFLICT(user_id) DO UPDATE SET role=excluded.role`);
  setRole.run('ADMIN', 'admin@secretbite.co');
  setRole.run('CLIENT', 'cliente@secretbite.co');
  setRole.run('CHEF', 'chef@secretbite.co');

  const count = db.prepare('SELECT COUNT(*) total FROM burgers').get().total;
  if (!count) {
    const insert = db.prepare('INSERT INTO burgers(name,description,ingredients,image_url,price_cop) VALUES(?,?,?,?,?)');
    insert.run('La Burger Explosiva', 'Intensa, ahumada y con el balance perfecto entre dulce y salado.', 'Carne Angus, doble cheddar, bacon en maple, rúgula, pan negro', '/assets/hero-burger.jpeg', 32000);
    insert.run('BBQ Crunch Supreme', 'Una candidata crocante con carácter de parrilla.', 'Carne de res, queso provolone, cebolla crispy, salsa BBQ', '/assets/hero-burger.jpeg', 29000);
    insert.run('Truffle Mushroom', 'Sabores terrosos y cremosos para una edición elegante.', 'Carne de res, hongos, queso suizo, mayonesa de trufa', '/assets/hero-burger.jpeg', 34000);
    insert.run('Spicy Jalapeño Bomb', 'Picante fresco, cremosidad y un final ahumado.', 'Carne de res, pepper jack, jalapeños, alioli chipotle', '/assets/hero-burger.jpeg', 30000);
  }

  if (!db.prepare('SELECT COUNT(*) total FROM campaigns').get().total) {
    const now = Date.now();
    const startsAt = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const endsAt = new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString();
    const result = db.prepare("INSERT INTO campaigns(name,starts_at,ends_at,published,status) VALUES(?,?,?,1,'PUBLISHED')").run('Burger del próximo mes', startsAt, endsAt);
    const add = db.prepare('INSERT INTO campaign_burgers(campaign_id,burger_id) VALUES(?,?)');
    for (const { id } of db.prepare('SELECT id FROM burgers WHERE active=1 LIMIT 4').all()) add.run(result.lastInsertRowid, id);
  }
}
