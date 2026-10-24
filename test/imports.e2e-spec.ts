import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { inArray, like } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import {
  invoiceImports,
  invoices,
  users,
} from '../src/database/schema/index.js';
import { createMailMock, createTestApp } from './create-test-app.js';

const EMAIL_DOMAIN = '@imports-e2e.test';
const PASSWORD = 'correct horse battery';
const GOOD_CSV =
  'description,amount,currency,paid_at\nWebsite design,15000,usd,2026-10-01\nLogo,5000,eur,2026-10-02\n';
const BAD_CSV =
  'description,amount,currency,paid_at\nGood row,1000,usd,2026-10-01\nBad row,abc,gbp,2026-10-02\n';

describe('Imports (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let otherToken: string;
  const mail = createMailMock();

  async function login() {
    const email = `user-${randomUUID()}${EMAIL_DOMAIN}`;
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ name: 'Test', email, password: PASSWORD })
      .expect(201);
    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return response.body.accessToken as string;
  }

  function upload(csv: string, fileName = 'invoices.csv', as = token) {
    return request(app.getHttpServer())
      .post('/v1/imports')
      .set('Authorization', `Bearer ${as}`)
      .attach('file', Buffer.from(csv), fileName);
  }

  async function waitUntilFinished(id: string) {
    for (let i = 0; i < 50; i++) {
      const response = await request(app.getHttpServer())
        .get(`/v1/imports/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      if (['completed', 'failed'].includes(response.body.status)) {
        return response.body;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Import did not finish');
  }

  beforeAll(async () => {
    app = await createTestApp(undefined, mail);
    token = await login();
    otherToken = await login();
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
      await db
        .delete(invoiceImports)
        .where(inArray(invoiceImports.userId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    await app.close();
  });

  it('accepts the file, returns an id, then imports the rows as paid', async () => {
    const response = await upload(GOOD_CSV).expect(202);
    expect(response.body).toMatchObject({
      id: expect.any(String),
      fileName: 'invoices.csv',
      status: 'pending',
    });

    const finished = await waitUntilFinished(response.body.id);
    expect(finished).toMatchObject({
      status: 'completed',
      importedCount: 2,
      errors: null,
    });
    expect(finished.finishedAt).not.toBeNull();

    const list = await request(app.getHttpServer())
      .get('/v1/invoices?status=paid')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.meta.total).toBe(2);
    await vi.waitFor(() =>
      expect(mail.sendImportCompleted).toHaveBeenCalledWith(
        expect.stringContaining(EMAIL_DOMAIN),
        'invoices.csv',
        2,
      ),
    );
  });

  it('fails the whole file when one row is wrong and saves nothing', async () => {
    const response = await upload(BAD_CSV, 'bad.csv').expect(202);

    const finished = await waitUntilFinished(response.body.id);
    expect(finished.status).toBe('failed');
    expect(finished.importedCount).toBe(0);
    expect(finished.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Row 3: amount'),
        expect.stringContaining('Row 3: currency'),
      ]),
    );

    const list = await request(app.getHttpServer())
      .get('/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.meta.total).toBe(2);
    await vi.waitFor(() => expect(mail.sendImportFailed).toHaveBeenCalled());
  });

  it('fails a file with no rows', async () => {
    const response = await upload(
      'description,amount,currency,paid_at\n',
    ).expect(202);

    const finished = await waitUntilFinished(response.body.id);
    expect(finished.status).toBe('failed');
    expect(finished.errors).toEqual(['The file has no rows']);
  });

  it('lists my imports, newest first', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/imports')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(
      response.body.map((item: { status: string }) => item.status),
    ).toEqual(['failed', 'failed', 'completed']);
  });

  it('does not show my import to another user', async () => {
    const response = await upload(GOOD_CSV).expect(202);

    await request(app.getHttpServer())
      .get(`/v1/imports/${response.body.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    await waitUntilFinished(response.body.id);
  });

  it('rejects a missing file, a non-csv file and no login', async () => {
    await request(app.getHttpServer())
      .post('/v1/imports')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await upload('hello', 'notes.txt').expect(400);
    await request(app.getHttpServer())
      .post('/v1/imports')
      .attach('file', Buffer.from(GOOD_CSV), 'invoices.csv')
      .expect(401);
  });
});
