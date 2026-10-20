import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type {Invoice } from '../database/schema/index.js';

@Injectable()
export class MailService {

  private readonly nodemailerTransporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT),
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });
 async sendPaymentSucceeded(to: string, invoice: Invoice) {
    await this.nodemailerTransporter.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject: `Invoice ${invoice.invoiceNumber} was paid`,
      text: `Invoice ${invoice.invoiceNumber} for ${invoice.amount / 100} ${invoice.currency.toUpperCase()} was paid.`,
    });
  }
   async sendPaymentFailed(to: string, invoice: Invoice) {
    await this.nodemailerTransporter.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject: `Payment failed for invoice ${invoice.invoiceNumber}`,
      text: `The payment for invoice ${invoice.invoiceNumber} failed. The invoice is still open.`,
    });
  }
}