import { Controller, Get, Header, Query } from '@nestjs/common';
import { InvoicesService } from './invoices.service.js';

function page(title: string, body: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: sans-serif; max-width: 480px; margin: 80px auto; padding: 0 16px; }
      .status { font-size: 20px; font-weight: bold; }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    ${body}
  </body>
</html>`;
}

@Controller('payment')
export class PaymentPagesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get('success')
  @Header('Content-Type', 'text/html')
  async success(@Query('session_id') sessionId?: string) {
    const invoice = sessionId
      ? await this.invoicesService.findBySession(sessionId)
      : undefined;

    if (!invoice) {
      return page(
        'Invoice not found',
        '<p>We could not find this payment.</p>',
      );
    }

    const amount = `${(invoice.amount / 100).toFixed(2)} ${invoice.currency.toUpperCase()}`;
    const message =
      invoice.status === 'paid'
        ? '<p>Thank you, your payment was received.</p>'
        : '<p>Your payment is being confirmed. Refresh this page in a few seconds.</p>';

    return page(
      'Payment',
      `<p>Invoice ${invoice.invoiceNumber}</p>
    <p>Amount: ${amount}</p>
    <p class="status">Status: ${invoice.status}</p>
    ${message}`,
    );
  }

  @Get('cancel')
  @Header('Content-Type', 'text/html')
  cancel() {
    return page(
      'Payment cancelled',
      '<p>No money was taken. You can open the payment link again to pay.</p>',
    );
  }
}
