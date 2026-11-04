import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { COLLECTIONS } from './collections.js';

export function auditDocument({ actorUserId = null, action, entityType, entityId = null, metadata = {}, requestId = null }) {
  return {
    actorUserId: actorUserId == null ? null : String(actorUserId),
    action,
    entityType,
    entityId: entityId == null ? null : String(entityId),
    metadata,
    requestId,
    createdAt: FieldValue.serverTimestamp()
  };
}

export function appendAudit(db, entry, writer = db.batch()) {
  const reference = db.collection(COLLECTIONS.auditLogs).doc();
  writer.create(reference, auditDocument(entry));
  return { writer, reference };
}

export function normalizeTimestamp(value) {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  return new Date(value).toISOString();
}
