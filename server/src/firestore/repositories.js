import { createFirestoreRepositoryAdapter } from '../hexagonal/adapters/outbound/firestore.adapter.js';

export function createFirestoreRepositories(db) {
  return createFirestoreRepositoryAdapter(db);
}
