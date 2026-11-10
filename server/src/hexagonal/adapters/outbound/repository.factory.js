/**
 * FÁBRICA DE ADAPTADORES DE SALIDA (Arquitectura Hexagonal)
 * Permite conmutar entre Firebase Cloud Firestore (`DB_PROVIDER=firestore`)
 * y SQLite (`DB_PROVIDER=sqlite`) manteniendo exactamente el mismo contrato de puertos.
 */

import { createFirestore } from '../../../firestore/client.js';
import { assertRepositoryPortContract } from '../../ports/repositories.port.js';
import { createFirestoreRepositoryAdapter } from './firestore.adapter.js';
import { createSqliteRepositoryAdapter } from './sqlite.adapter.js';

export function createRepositoryAdapter({
  provider = process.env.DB_PROVIDER || 'sqlite',
  sqliteDb = null,
  firestoreDb = null
} = {}) {
  const normalizedProvider = String(provider || 'sqlite').trim().toLowerCase();

  if (normalizedProvider === 'firestore' || firestoreDb) {
    const instance = firestoreDb || createFirestore();
    return assertRepositoryPortContract(createFirestoreRepositoryAdapter(instance));
  }

  if (!sqliteDb) {
    throw new Error('Se requiere una instancia de base de datos para el adaptador seleccionado.');
  }
  return assertRepositoryPortContract(createSqliteRepositoryAdapter(sqliteDb));
}

