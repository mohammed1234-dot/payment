import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { like } from 'drizzle-orm';
import request from 'supertest';
import { DatabaseService } from '../src/database/database.service.js';
import { users } from '../src/database/schema/index.js';
import { createTestApp } from './create-test-app.js';

const EMAIL_DOMAIN = '@auth-e2e.test';
const newEmail = () => `user-${randomUUID()}${EMAIL_DOMAIN}`;
const PASSWORD = 'correct horse battery';

async function deleteTestUsers(app: INestApplication): Promise<void> {
  await app
    .get(DatabaseService)
    .db.delete(users)
    .where(like(users.email, `%${EMAIL_DOMAIN}`));
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const email = newEmail();

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await deleteTestUsers(app);
    await app.close();
  });

  describe('POST /v1/auth/register', () => {
    it('creates the user, lowercases the email and never returns the hash', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ name: ' Ali ', email: email.toUpperCase(), password: PASSWORD })
        .expect(201);

      expect(response.body).toEqual({
        id: expect.any(String),
        name: 'Ali',
        email,
        createdAt: expect.any(String),
      });
    });

    it('answers 409 for the same email in another case', () => {
      return request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ name: 'Ali', email: email.toUpperCase(), password: PASSWORD })
        .expect(409);
    });

    it('answers 400 for an invalid email and a short password', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({ name: 'Ali', email: 'not-an-email', password: 'short' })
        .expect(400);

      expect(response.body.message).toBe('Validation failed');
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'email' }),
          expect.objectContaining({ field: 'password' }),
        ]),
      );
    });

    it('answers 400 for fields the DTO does not declare', () => {
      return request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          name: 'Ali',
          email: newEmail(),
          password: PASSWORD,
          role: 'admin',
        })
        .expect(400);
    });
  });

  describe('POST /v1/auth/login and GET /v1/auth/me', () => {
    let accessToken: string;

    it('returns a bearer token for the right password', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: email.toUpperCase(), password: PASSWORD })
        .expect(200);

      expect(response.body).toEqual({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresIn: expect.any(Number),
        user: expect.objectContaining({ email }),
      });
      expect(response.body.user).not.toHaveProperty('passwordHash');
      accessToken = response.body.accessToken;
    });

    it('answers 401 with the same message for a wrong password and an unknown email', async () => {
      const wrongPassword = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: 'wrong password' })
        .expect(401);
      const unknownEmail = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: newEmail(), password: PASSWORD })
        .expect(401);

      expect(wrongPassword.body.message).toBe('Invalid email or password');
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    });

    it('GET /v1/auth/me returns the user for a valid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.email).toBe(email);
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('GET /v1/auth/me answers 401 without a token', () => {
      return request(app.getHttpServer()).get('/v1/auth/me').expect(401);
    });

    it('GET /v1/auth/me answers 401 for a tampered token', () => {
      const tampered = `${accessToken.slice(0, -2)}xx`;
      return request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${tampered}`)
        .expect(401);
    });
  });
});

describe('Auth rate limit (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 429 after 5 login attempts in a minute', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: newEmail(), password: 'wrong password' });

    for (let i = 0; i < 5; i++) {
      await attempt().expect(401);
    }
    await attempt().expect(429);
  });
});
