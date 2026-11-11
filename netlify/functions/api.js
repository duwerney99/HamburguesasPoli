import serverless from 'serverless-http';
import { createApp } from '../../server/src/app.js';
import { createFirestore } from '../../server/src/firestore/client.js';

const jwtSecret = process.env.JWT_SECRET;
const refreshSecret = process.env.REFRESH_TOKEN_SECRET;

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET debe configurarse con al menos 32 caracteres en Netlify.');
}
if (!refreshSecret || refreshSecret.length < 32) {
  throw new Error('REFRESH_TOKEN_SECRET debe configurarse con al menos 32 caracteres en Netlify.');
}

const firestoreDb = createFirestore();
const app = createApp({
  provider: 'firestore',
  firestoreDb,
  jwtSecret,
  refreshSecret,
  clientOrigin: process.env.CLIENT_ORIGIN || process.env.URL || 'http://localhost:8888'
});

export const handler = serverless(app);
