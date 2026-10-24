import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import {
  invoiceImports,
  type InvoiceImport,
} from '../database/schema/index.js';

@Injectable()
export class ImportsRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(userId: string, fileName: string): Promise<InvoiceImport> {
    const [created] = await this.database.db
      .insert(invoiceImports)
      .values({ userId, fileName })
      .returning();
    return created;
  }

  async findForUser(
    id: string,
    userId: string,
  ): Promise<InvoiceImport | undefined> {
    const [found] = await this.database.db
      .select()
      .from(invoiceImports)
      .where(and(eq(invoiceImports.id, id), eq(invoiceImports.userId, userId)))
      .limit(1);
    return found;
  }

  listForUser(userId: string): Promise<InvoiceImport[]> {
    return this.database.db
      .select()
      .from(invoiceImports)
      .where(eq(invoiceImports.userId, userId))
      .orderBy(desc(invoiceImports.createdAt))
      .limit(50);
  }

  async update(id: string, data: Partial<InvoiceImport>) {
    await this.database.db
      .update(invoiceImports)
      .set(data)
      .where(eq(invoiceImports.id, id));
  }
}
