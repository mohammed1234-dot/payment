import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseService } from './database/database.service.js';

describe('AppController', () => {
  let appController: AppController;
  const database = { ping: vi.fn<() => Promise<void>>() };

  beforeEach(async () => {
    database.ping.mockReset();
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: DatabaseService, useValue: database }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('reports ok when the database answers', async () => {
    database.ping.mockResolvedValue(undefined);
    await expect(appController.checkHealth()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('answers 503 without leaking the driver error when the database is down', async () => {
    database.ping.mockRejectedValue(
      new Error('connect ECONNREFUSED postgres://secret@db:5432'),
    );
    const result = appController.checkHealth();
    await expect(result).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(result).rejects.not.toThrow(/secret/);
  });
});
