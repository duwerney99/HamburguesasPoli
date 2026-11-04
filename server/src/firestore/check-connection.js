import { loadEnv } from '../config.js';
import { createFirestore } from './client.js';
import { COLLECTIONS } from './collections.js';

loadEnv();
const db = createFirestore();
const snapshot = await db.collection(COLLECTIONS.users).limit(1).get();
console.log(JSON.stringify({ ok: true, projectId: process.env.FIREBASE_PROJECT_ID, databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)', usersCollectionReadable: true, sampleSize: snapshot.size }, null, 2));
