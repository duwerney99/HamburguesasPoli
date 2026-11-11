import { loadEnv } from '../config.js';
import { createDatabase } from '../db.js';
import { createFirestore } from './client.js';
import { COLLECTIONS, SUBCOLLECTIONS, documentIds } from './collections.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import crypto from 'node:crypto';

loadEnv();
if (process.env.DB_PROVIDER === 'firestore') throw new Error('La migración debe ejecutarse mientras DB_PROVIDER=sqlite.');

const sqlite = createDatabase(process.env.DB_PATH || './server/data/secret-bite.db');
const firestore = createFirestore();
const stats = { users: 0, roles: 0, userEmails: 0, burgers: 0, campaigns: 0, candidates: 0, votes: 0, orders: 0, items: 0, events: 0, auditLogs: 0 };
let batch = firestore.batch();
let operations = 0;

async function put(reference, data) {
  batch.set(reference, data, { merge: true });
  operations += 1;
  if (operations >= 400) {
    await batch.commit();
    batch = firestore.batch();
    operations = 0;
  }
}

const timestamp = value => value ? Timestamp.fromDate(new Date(value.endsWith?.('Z') ? value : `${value.replace(' ', 'T')}Z`)) : null;
const parseJson = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
const emailKey = value => crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');

try {
  const users = sqlite.prepare(`SELECT u.id,u.name,u.email,u.password_hash passwordHash,u.created_at createdAt,
    COALESCE(ur.role,u.role) role FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id`).all();
  for (const user of users) {
    const userId = documentIds.user(user.id);
    await put(firestore.collection(COLLECTIONS.users).doc(userId), {
      legacyId: user.id, name: user.name, email: user.email.toLowerCase(), passwordHash: user.passwordHash,
      createdAt: timestamp(user.createdAt), migratedAt: FieldValue.serverTimestamp()
    });
    await put(firestore.collection(COLLECTIONS.roles).doc(userId), { userId, role: user.role, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'MIGRATION' });
    await put(firestore.collection(COLLECTIONS.userEmails).doc(emailKey(user.email)), {
      email: user.email.toLowerCase(), userId, createdAt: FieldValue.serverTimestamp(), source: 'SQLITE_MIGRATION'
    });
    stats.users += 1; stats.roles += 1; stats.userEmails += 1;
  }

  const burgers = sqlite.prepare(`SELECT id,name,description,ingredients,image_url imageUrl,price_cop priceCop,active,created_at createdAt FROM burgers`).all();
  for (const burger of burgers) {
    await put(firestore.collection(COLLECTIONS.burgers).doc(documentIds.burger(burger.id)), {
      legacyId: burger.id, name: burger.name, description: burger.description,
      ingredients: burger.ingredients.split(',').map(value => value.trim()).filter(Boolean), imageUrl: burger.imageUrl,
      priceCop: burger.priceCop, active: Boolean(burger.active), createdAt: timestamp(burger.createdAt), updatedAt: FieldValue.serverTimestamp()
    });
    stats.burgers += 1;
  }

  const campaigns = sqlite.prepare(`SELECT id,name,starts_at startsAt,ends_at endsAt,status,winner_burger_id winnerBurgerId,closed_at closedAt,created_at createdAt FROM campaigns`).all();
  for (const campaign of campaigns) {
    const campaignRef = firestore.collection(COLLECTIONS.campaigns).doc(documentIds.campaign(campaign.id));
    await put(campaignRef, {
      legacyId: campaign.id, name: campaign.name, startsAt: timestamp(campaign.startsAt), endsAt: timestamp(campaign.endsAt),
      status: campaign.status, winnerBurgerId: campaign.winnerBurgerId == null ? null : String(campaign.winnerBurgerId),
      closedAt: timestamp(campaign.closedAt), createdAt: timestamp(campaign.createdAt), updatedAt: FieldValue.serverTimestamp()
    });
    stats.campaigns += 1;
    const candidates = sqlite.prepare(`SELECT cb.burger_id burgerId,b.name burgerName,COUNT(v.id) voteCount
      FROM campaign_burgers cb JOIN burgers b ON b.id=cb.burger_id
      LEFT JOIN votes v ON v.campaign_id=cb.campaign_id AND v.burger_id=cb.burger_id
      WHERE cb.campaign_id=? GROUP BY cb.burger_id,b.name`).all(campaign.id);
    for (const candidate of candidates) {
      await put(campaignRef.collection(SUBCOLLECTIONS.campaignCandidates).doc(String(candidate.burgerId)), {
        burgerId: String(candidate.burgerId), burgerNameSnapshot: candidate.burgerName, voteCount: candidate.voteCount, createdAt: FieldValue.serverTimestamp()
      });
      stats.candidates += 1;
    }
  }

  for (const vote of sqlite.prepare('SELECT id,user_id userId,campaign_id campaignId,burger_id burgerId,quantity,payment_status paymentStatus,order_id orderId,created_at createdAt FROM votes').all()) {
    await put(firestore.collection(COLLECTIONS.votes).doc(documentIds.vote(vote.campaignId, vote.userId)), {
      legacyId: vote.id,
      userId: String(vote.userId),
      campaignId: String(vote.campaignId),
      burgerId: String(vote.burgerId),
      quantity: Number(vote.quantity || 1),
      paymentStatus: vote.paymentStatus || 'UNPAID',
      orderId: vote.orderId == null ? null : String(vote.orderId),
      createdAt: timestamp(vote.createdAt)
    });
    stats.votes += 1;
  }

  const orders = sqlite.prepare(`SELECT id,user_id userId,status,payment_status paymentStatus,campaign_id campaignId,vote_id voteId,phone,delivery_address deliveryAddress,notes,total_cop totalCop,created_at createdAt,updated_at updatedAt FROM orders`).all();
  for (const order of orders) {
    const orderRef = firestore.collection(COLLECTIONS.orders).doc(documentIds.order(order.id));
    await put(orderRef, {
      ...order,
      userId: String(order.userId),
      paymentStatus: order.paymentStatus || 'UNPAID',
      campaignId: order.campaignId == null ? null : String(order.campaignId),
      voteId: order.voteId == null ? null : String(order.voteId),
      legacyId: order.id,
      createdAt: timestamp(order.createdAt),
      updatedAt: timestamp(order.updatedAt)
    });
    stats.orders += 1;
    for (const item of sqlite.prepare(`SELECT id,burger_id burgerId,burger_name burgerName,ingredients_snapshot ingredients,
      removed_ingredients removedIngredients,notes,quantity,unit_price_cop unitPriceCop FROM order_items WHERE order_id=?`).all(order.id)) {
      await put(orderRef.collection(SUBCOLLECTIONS.orderItems).doc(String(item.id)), {
        ...item, burgerId: item.burgerId == null ? null : String(item.burgerId),
        ingredients: item.ingredients.split(',').map(value => value.trim()).filter(Boolean),
        removedIngredients: parseJson(item.removedIngredients, [])
      });
      stats.items += 1;
    }
    await put(orderRef.collection(SUBCOLLECTIONS.orderEvents).doc('migration'), {
      type: 'MIGRATED', from: null, to: order.status, actorUserId: null, createdAt: FieldValue.serverTimestamp()
    });
    stats.events += 1;
  }

  for (const entry of sqlite.prepare(`SELECT id,actor_user_id actorUserId,action,entity_type entityType,entity_id entityId,metadata,created_at createdAt FROM audit_logs`).all()) {
    await put(firestore.collection(COLLECTIONS.auditLogs).doc(String(entry.id)), {
      legacyId: entry.id, actorUserId: entry.actorUserId == null ? null : String(entry.actorUserId), action: entry.action,
      entityType: entry.entityType, entityId: entry.entityId, metadata: parseJson(entry.metadata, {}), createdAt: timestamp(entry.createdAt), source: 'SQLITE_MIGRATION'
    });
    stats.auditLogs += 1;
  }

  await put(firestore.collection('_system').doc('migration'), {
    schemaVersion: 1, source: 'sqlite', completedAt: FieldValue.serverTimestamp(), stats
  });
  if (operations) await batch.commit();
  console.log(JSON.stringify({ ok: true, projectId: process.env.FIREBASE_PROJECT_ID, stats }, null, 2));
} finally {
  sqlite.close();
}
