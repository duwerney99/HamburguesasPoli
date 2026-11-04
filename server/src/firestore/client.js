import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';

function credentialFromEnvironment() {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path) return applicationDefault();
  if (!fs.existsSync(path)) throw new Error(`No existe GOOGLE_APPLICATION_CREDENTIALS: ${path}`);
  return cert(JSON.parse(fs.readFileSync(path, 'utf8')));
}

export function createFirestore() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID es obligatorio para usar Firestore.');
  const app = getApps()[0] || initializeApp({ credential: credentialFromEnvironment(), projectId });
  const databaseId = process.env.FIRESTORE_DATABASE_ID?.trim();
  const firestore = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  firestore.settings({ ignoreUndefinedProperties: true });
  return firestore;
}
