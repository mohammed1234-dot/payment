import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { parse } from 'csv-parse/sync';
import type { InvoiceImport } from '../database/schema/index.js';
import { ImportStatus } from '../database/schema/import-status.js';
import { InvoicesService } from '../invoices/invoices.service.js';
import { MailService } from '../mail/mail.service.js';
import { UsersRepository } from '../users/users.repository.js';
import { importRowSchema, type ImportRow } from './dto/import-row.dto.js';
import { ImportsRepository } from './imports.repository.js';

export type ImportJob = {
  importId: string;
  userId: string;
  csv: string;
};

function toImportResponse(found: InvoiceImport) {
  return {
    id: found.id,
    fileName: found.fileName,
    status: found.status,
    importedCount: found.importedCount,
    errors: found.errors,
    createdAt: found.createdAt,
    finishedAt: found.finishedAt,
  };
}

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    @InjectQueue('invoice-imports') private readonly queue: Queue<ImportJob>,
    private readonly importsRepository: ImportsRepository,
    private readonly invoicesService: InvoicesService,
    private readonly usersRepository: UsersRepository,
    private readonly mailService: MailService,
  ) {}

  async upload(userId: string, file: { buffer: Buffer; originalname: string }) {
    const created = await this.importsRepository.create(
      userId,
      file.originalname,
    );

    await this.queue.add(
      'import',
      { importId: created.id, userId, csv: file.buffer.toString('utf8') },
      { removeOnComplete: true, removeOnFail: true },
    );

    return toImportResponse(created);
  }

  async list(userId: string) {
    const imports = await this.importsRepository.listForUser(userId);
    return imports.map((found) => toImportResponse(found));
  }

  async findOne(userId: string, id: string) {
    const found = await this.importsRepository.findForUser(id, userId);

    if (!found) {
      throw new NotFoundException('Import not found');
    }

    return toImportResponse(found);
  }

  async process(job: ImportJob) {
    await this.importsRepository.update(job.importId, {
      status: ImportStatus.Processing,
    });

    const { rows, errors } = this.readRows(job.csv);
    let importedCount = 0;

    if (errors.length === 0) {
      try {
        importedCount = await this.invoicesService.createPaidInvoices(
          job.userId,
          rows,
        );
      } catch (error) {
        errors.push(
          error instanceof Error ? error.message : 'Could not save invoices',
        );
      }
    }

    const failed = errors.length > 0;

    await this.importsRepository.update(job.importId, {
      status: failed ? ImportStatus.Failed : ImportStatus.Completed,
      importedCount,
      errors: failed ? errors : null,
      finishedAt: new Date(),
    });

    await this.notify(job, failed, importedCount, errors);
  }

  private readRows(csv: string) {
    const rows: ImportRow[] = [];
    const errors: string[] = [];

    let records: Record<string, string>[];
    try {
      records = parse(csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch {
      return { rows, errors: ['The file is not a valid CSV'] };
    }

    if (records.length === 0) {
      return { rows, errors: ['The file has no rows'] };
    }

    for (const [index, record] of records.entries()) {
      const result = importRowSchema.safeParse(record);
      if (result.success) {
        rows.push(result.data);
      } else {
        for (const issue of result.error.issues) {
          errors.push(
            `Row ${index + 2}: ${issue.path.join('.')}: ${issue.message}`,
          );
        }
      }
    }

    return { rows, errors };
  }

  private async notify(
    job: ImportJob,
    failed: boolean,
    importedCount: number,
    errors: string[],
  ) {
    try {
      const user = await this.usersRepository.findById(job.userId);
      const found = await this.importsRepository.findForUser(
        job.importId,
        job.userId,
      );
      if (!user || !found) return;

      if (failed) {
        await this.mailService.sendImportFailed(
          user.email,
          found.fileName,
          errors,
        );
      } else {
        await this.mailService.sendImportCompleted(
          user.email,
          found.fileName,
          importedCount,
        );
      }
    } catch (error) {
      this.logger.error(
        `Could not send email for import ${job.importId}`,
        error,
      );
    }
  }
}
