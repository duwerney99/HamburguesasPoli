import { loadEnv } from './config.js';
import { createDatabase } from './db.js';
import { seedDatabase } from './seed-data.js';
import { createFirestore } from './firestore/client.js';
import { createApp } from './app.js';

loadEnv();
const port = Number(process.env.PORT || 3001);
const provider = (process.env.DB_PROVIDER || 'sqlite').trim().toLowerCase();
const jwtSecret = process.env.JWT_SECRET || 'dev-only-change-me';

if (
  process.env.NODE_ENV === 'production' &&
  (jwtSecret === 'dev-only-change-me' || jwtSecret.length < 32)
) {
  throw new Error('JWT_SECRET debe configurarse con al menos 32 caracteres en producción.');
}

let db = null;
let firestore = null;

if (provider === 'firestore') {
  firestore = createFirestore();
} else {
  db = createDatabase(process.env.DB_PATH || './server/data/secret-bite.db');
  seedDatabase(db);
}

const app = createApp({
  db,
  firestore,
  provider,
  jwtSecret,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173'
});

const server = app.listen(port, () =>
  console.log(
    `Secret Bite API (Arquitectura Hexagonal · Adaptador: ${provider}) disponible en http://localhost:${port}`
  )
);

function shutdown() {
  server.close(() => {
    if (db) db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
