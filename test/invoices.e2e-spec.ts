import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { inArray, like } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { invoices, users } from '../src/database/schema/index.js';
import { createTestApp } from './create-test-app.js';

const EMAIL_DOMAIN = '@invoices-e2e.test';
const PASSWORD = 'correct horse battery';

async function createUserAndLogin(app: INestApplication): Promise<string> {
  const email = `user-${randomUUID()}${EMAIL_DOMAIN}`;
  await request(app.getHttpServer())
    .post('/v1/auth/register')
    .send({ name: 'Test', email, password: PASSWORD })
    .expect(201);
  const response = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return response.body.accessToken;
}

describe('Invoices (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let otherToken: string;
  let invoiceId: string;
  let publicToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    ownerToken = await createUserAndLogin(app);
    otherToken = await createUserAndLogin(app);
  });

  afterAll(async () => {
    const db = app.get(DatabaseService).db;
    const testUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, `%${EMAIL_DOMAIN}`));
    const ids = testUsers.map((user) => user.id);
    if (ids.length > 0) {
      await db.delete(invoices).where(inArray(invoices.userId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    await app.close();
  });

  describe('POST /v1/invoices', () => {
    it('creates a pending invoice and returns the public token once', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/invoices')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ description: 'Website design', amount: 15000, currency: 'usd' })
        .expect(201);

      expect(response.body).toMatchObject({
        description: 'Website design',
        amount: 15000,
        currency: 'usd',
        status: 'pending',
        expiresAt: null,
        paidAt: null,
      });
      expect(response.body.invoiceNumber).toMatch(/^INV-\d{8}-[0-9A-F]{8}$/);
      expect(response.body.publicToken).toEqual(expect.any(String));
      expect(response.body).not.toHaveProperty('publicTokenHash');
      expect(response.body).not.toHaveProperty('userId');

      invoiceId = response.body.id;
      publicToken = response.body.publicToken;
    });

    it('answers 401 without a token', () => {
      return request(app.getHttpServer())
        .post('/v1/invoices')
        .send({ description: 'x', amount: 100, currency: 'usd' })
        .expect(401);
    });

    it('answers 400 for a decimal amount, an unknown currency and a past expiry', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/invoices')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          description: 'x',
          amount: 10.5,
          currency: 'xyz',
          expiresAt: '2020-01-01T00:00:00Z',
        })
        .expect(400);

      const fields = response.body.errors.map(
        (error: { field: string }) => error.field,
      );
      expect(fields).toEqual(
        expect.arrayContaining(['amount', 'currency', 'expiresAt']),
      );
    });

    it('answers 400 when the body tries to set the status', () => {
      return request(app.getHttpServer())
        .post('/v1/invoices')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          description: 'x',
          amount: 100,
          currency: 'usd',
          status: 'paid',
        })
        .expect(400);
    });
  });

  describe('GET /v1/invoices/:id', () => {
    it('returns the invoice to its owner', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(response.body.id).toBe(invoiceId);
    });

    it("answers 404 for another user's invoice, same as a missing one", async () => {
      await request(app.getHttpServer())
        .get(`/v1/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/v1/invoices/${randomUUID()}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });

    it('answers 400 for an id that is not a uuid', () => {
      return request(app.getHttpServer())
        .get('/v1/invoices/123')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);
    });
  });

  describe('GET /v1/invoices', () => {
    beforeAll(async () => {
      for (const amount of [200, 300]) {
        await request(app.getHttpServer())
          .post('/v1/invoices')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ description: `Invoice ${amount}`, amount, currency: 'eur' })
          .expect(201);
      }
    });

    it('lists only my invoices, newest first, with pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/invoices?page=1&limit=2')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(response.body.meta).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
      expect(
        response.body.data.map((i: { amount: number }) => i.amount),
      ).toEqual([300, 200]);

      const page2 = await request(app.getHttpServer())
        .get('/v1/invoices?page=2&limit=2')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(page2.body.data).toHaveLength(1);
      expect(page2.body.data[0].id).toBe(invoiceId);
    });

    it('does not show my invoices to another user', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/invoices')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);

      expect(response.body.meta.total).toBe(0);
      expect(response.body.data).toEqual([]);
    });

    it('filters by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/invoices?status=paid')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(response.body.meta.total).toBe(0);
    });

    it('answers 400 for an unknown status or limit over 100', async () => {
      await request(app.getHttpServer())
        .get('/v1/invoices?status=done')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);
      await request(app.getHttpServer())
        .get('/v1/invoices?limit=500')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);
    });
  });

  describe('GET /v1/public/invoices/:token', () => {
    it('shows the invoice to anyone with the link, without private fields', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/public/invoices/${publicToken}`)
        .expect(200);

      expect(response.body).toEqual({
        invoiceNumber: expect.any(String),
        description: 'Website design',
        amount: 15000,
        currency: 'usd',
        status: 'pending',
        expiresAt: null,
        paidAt: null,
      });
    });

    it('answers 404 for a wrong token', () => {
      return request(app.getHttpServer())
        .get(`/v1/public/invoices/${publicToken}x`)
        .expect(404);
    });
  });
});
