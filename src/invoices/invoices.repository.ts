import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, lte } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import {
  invoices,
  type Invoice,
  type NewInvoice,
} from '../database/schema/index.js';
import type { ListInvoicesInput } from './dto/list-invoices.dto.js';

@Injectable()
export class InvoicesRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(data: NewInvoice): Promise<Invoice> {
    const [invoice] = await this.database.db
      .insert(invoices)
      .values(data)
      .returning();
    return invoice;
  }

  async findByIdForUser(
    id: string,
    userId: string,
  ): Promise<Invoice | undefined> {
    const [invoice] = await this.database.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.userId, userId)))
      .limit(1);
    return invoice;
  }

  async findByPublicTokenHash(hash: string): Promise<Invoice | undefined> {
    const [invoice] = await this.database.db
      .select()
      .from(invoices)
      .where(eq(invoices.publicTokenHash, hash))
      .limit(1);
    return invoice;
  }

  async listForUser(
    userId: string,
    filters: ListInvoicesInput,
  ): Promise<{ rows: Invoice[]; total: number }> {
    const conditions = [eq(invoices.userId, userId)];
    if (filters.status) conditions.push(eq(invoices.status, filters.status));
    if (filters.from) conditions.push(gte(invoices.createdAt, filters.from));
    if (filters.to) conditions.push(lte(invoices.createdAt, filters.to));
    const where = and(...conditions);

    const rows = await this.database.db
      .select()
      .from(invoices)
      .where(where)
      .orderBy(desc(invoices.createdAt), desc(invoices.id))
      .limit(filters.limit)
      .offset((filters.page - 1) * filters.limit);

    const [{ total }] = await this.database.db
      .select({ total: count() })
      .from(invoices)
      .where(where);

    return { rows, total };
  }
}
