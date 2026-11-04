import { loadEnv } from './config.js';
import { createDatabase } from './db.js';
import { seedDatabase } from './seed-data.js';

loadEnv();
const db = createDatabase(process.env.DB_PATH || './server/data/secret-bite.db');
seedDatabase(db);
db.close();
console.log('Datos demo creados.');
