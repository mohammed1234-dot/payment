import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module.js';
import { MailModule } from '../mail/mail.module.js';
import { UsersModule } from '../users/users.module.js';
import { ImportsController } from './imports.controller.js';
import { ImportsProcessor } from './imports.processor.js';
import { ImportsRepository } from './imports.repository.js';
import { ImportsService } from './imports.service.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'invoice-imports' }),
    InvoicesModule,
    MailModule,
    UsersModule,
  ],
  controllers: [ImportsController],
  providers: [ImportsService, ImportsRepository, ImportsProcessor],
})
export class ImportsModule {}
