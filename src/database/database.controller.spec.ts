import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseController } from './database.controller.js';
import { DatabaseService } from './database.service.js';

describe('DatabaseController', () => {
  let controller: DatabaseController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DatabaseController],
      providers: [DatabaseService],
    }).compile();

    controller = module.get<DatabaseController>(DatabaseController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
