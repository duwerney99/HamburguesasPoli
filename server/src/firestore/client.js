import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';

function credentialFromEnvironment() {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!path) return applicationDefault();
  if (!fs.existsSync(path)) {
    throw new Error(`No existe GOOGLE_APPLICATION_CREDENTIALS: ${path}`);
  }
  return cert(JSON.parse(fs.readFileSync(path, 'utf8')));
}

export function createFirestore() {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST?.trim();
  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() || (emulatorHost ? 'secret-bite-medellin' : '');
  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID es obligatorio para usar Firestore.');
  }

  const options = emulatorHost
    ? { projectId }
    : { credential: credentialFromEnvironment(), projectId };

  const app = getApps()[0] || initializeApp(options);
  const databaseId = process.env.FIRESTORE_DATABASE_ID?.trim();
  const firestore = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  try {
    firestore.settings({ ignoreUndefinedProperties: true });
  } catch {
    /* settings() ya fue invocado previamente en esta instancia */
  }
  return firestore;
}
