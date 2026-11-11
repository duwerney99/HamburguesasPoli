import { describe, expect, it } from 'vitest';
import { createFirestoreRepositoryAdapter } from '../../src/hexagonal/adapters/outbound/firestore.adapter.js';
import { createApplicationUseCases } from '../../src/modules/index.js';
import { COLLECTIONS } from '../../src/firestore/collections.js';
import { createFakeFirestore } from '../helpers/fake-firestore.js';

describe('Firestore adapter sin credenciales reales', () => {
  it('reserva el correo de forma transaccional y persiste usuario, rol y refresh token', async () => {
    const firestore = createFakeFirestore();
    const adapter = createFirestoreRepositoryAdapter(firestore);
    const useCases = createApplicationUseCases(adapter, {
      jwtSecret: 'access-secret-de-prueba-con-suficiente-longitud',
      refreshSecret: 'refresh-secret-de-prueba-distinto-y-seguro'
    });

    const first = await useCases.auth.register({
      name: 'Cliente Firestore', email: 'cliente@firestore.test', password: 'Segura123!'
    });
    await expect(useCases.auth.register({
      name: 'Duplicado', email: 'CLIENTE@firestore.test', password: 'Segura123!'
    })).rejects.toMatchObject({ status: 409 });

    expect(first.user).toMatchObject({ email: 'cliente@firestore.test', role: 'CLIENT' });
    const paths = [...firestore.dump().keys()];
    expect(paths.filter(path => path.startsWith(`${COLLECTIONS.users}/`))).toHaveLength(1);
    expect(paths.filter(path => path.startsWith(`${COLLECTIONS.roles}/`))).toHaveLength(1);
    expect(paths.filter(path => path.startsWith(`${COLLECTIONS.userEmails}/`))).toHaveLength(1);
    expect(paths.filter(path => path.startsWith(`${COLLECTIONS.refreshTokens}/`))).toHaveLength(1);
  });

  it('al pagar un voto crea pedido, item, evento y auditoría enlazados', async () => {
    const firestore = createFakeFirestore();
    const adapter = createFirestoreRepositoryAdapter(firestore);
    await firestore.collection(COLLECTIONS.users).doc('user-1').set({ name: 'Ana', email: 'ana@test.co' });
    await firestore.collection(COLLECTIONS.burgers).doc('burger-1').set({
      name: 'Burger Test', ingredients: ['Carne', 'Queso'], imageUrl: '/burger.jpg', priceCop: 30000, active: true
    });
    await firestore.collection(COLLECTIONS.campaigns).doc('campaign-1').set({ name: 'Campaña Test', status: 'PUBLISHED' });
    await firestore.collection(COLLECTIONS.votes).doc('vote-1').set({
      userId: 'user-1', burgerId: 'burger-1', campaignId: 'campaign-1', quantity: 2, paymentStatus: 'UNPAID', orderId: null
    });

    const result = await adapter.orders.updateCampaignVoteSale({
      voteId: 'vote-1', paymentStatus: 'PAID', actorUserId: 'admin-1'
    });
    expect(result.order).toMatchObject({ paymentStatus: 'PAID', status: 'CONFIRMED', totalCop: 60000, totalBurgers: 2 });
    const dump = firestore.dump();
    expect([...dump.keys()].some(path => /^orders\/[^/]+\/items\//.test(path))).toBe(true);
    expect([...dump.keys()].some(path => /^orders\/[^/]+\/events\//.test(path))).toBe(true);
    expect([...dump.keys()].some(path => path.startsWith(`${COLLECTIONS.auditLogs}/`))).toBe(true);
    expect(dump.get(`${COLLECTIONS.votes}/vote-1`).orderId).toBe(result.order.id);
  });

  it('cierra la campaña usando los contadores leídos dentro de la transacción', async () => {
    const firestore = createFakeFirestore();
    const adapter = createFirestoreRepositoryAdapter(firestore);
    const campaign = firestore.collection(COLLECTIONS.campaigns).doc('campaign-close');
    await campaign.set({
      name: 'Cierre seguro', status: 'PUBLISHED', published: true,
      startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-30T00:00:00.000Z'
    });
    await firestore.collection(COLLECTIONS.burgers).doc('burger-a').set({ name: 'A', active: true, priceCop: 20000 });
    await firestore.collection(COLLECTIONS.burgers).doc('burger-b').set({ name: 'B', active: true, priceCop: 25000 });
    await campaign.collection('candidates').doc('burger-a').set({ burgerId: 'burger-a', voteCount: 2, desiredQuantity: 2 });
    await campaign.collection('candidates').doc('burger-b').set({ burgerId: 'burger-b', voteCount: 4, desiredQuantity: 4 });

    const closed = await adapter.campaigns.close('campaign-close', 'burger-a', 'admin-1');
    expect(closed).toMatchObject({ lifecycleStatus: 'CLOSED', winnerBurgerId: 'burger-b' });
    expect(firestore.dump().get('campaigns/campaign-close').winnerBurgerId).toBe('burger-b');
  });
});
