# Payment API

Invoices with Stripe Checkout. A user creates an invoice, shares a link, and the customer pays it on Stripe without an account. Stripe tells the API about the payment through a webhook, the invoice becomes `paid`, and the owner gets an email. Invoices that were already paid somewhere else can be uploaded in bulk from a CSV file, which is processed in a background queue.

Built with NestJS, PostgreSQL, Drizzle ORM, Zod, Stripe (test mode), BullMQ with Redis, and Nodemailer with Mailtrap.

## Setup

You need Node 22, Docker, a Stripe account in test mode and a Mailtrap account.

```bash
npm install
cp .env.example .env
docker compose up -d
npm run db:migrate
npm run start:dev
```

`docker compose up -d` starts Postgres on port `5433` and Redis on port `6380`.

The API runs on `http://localhost:3000/v1`. Check it with `GET /v1/health`.

## Environment variables

| Name                    | Example                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`          | `postgresql://postgres:postgres@localhost:5433/payments_db`       |
| `JWT_SECRET`            | a long random string                                              |
| `REDIS_HOST`            | `localhost`                                                       |
| `REDIS_PORT`            | `6380`                                                            |
| `APP_URL`               | `http://localhost:3000/v1` (where Stripe sends the customer back) |
| `STRIPE_SECRET_KEY`     | `sk_test_...` from Stripe Dashboard > Developers > API keys       |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` printed by `stripe listen`                            |
| `MAIL_HOST`             | `sandbox.smtp.mailtrap.io`                                        |
| `MAIL_PORT`             | `587`                                                             |
| `MAIL_USER`             | from Mailtrap > Email Testing > Inbox > SMTP                      |
| `MAIL_PASS`             | from Mailtrap > Email Testing > Inbox > SMTP                      |
| `MAIL_FROM`             | `Payments <no-reply@payments.test>`                               |

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

After changing `.env`, restart the API. The watch mode does not reload it.

## Endpoints

All routes start with `/v1`. Routes marked "token" need `Authorization: Bearer <accessToken>` from login.

| Method | Route                              | Auth             | What it does                                         |
| ------ | ---------------------------------- | ---------------- | ---------------------------------------------------- |
| GET    | `/health`                          |                  | API and database status                              |
| POST   | `/auth/register`                   |                  | `{ name, email, password }`                          |
| POST   | `/auth/login`                      |                  | `{ email, password }`, returns `accessToken`         |
| GET    | `/auth/me`                         | token            | Current user                                         |
| POST   | `/invoices`                        | token            | `{ description, amount, currency, expiresAt? }`      |
| GET    | `/invoices`                        | token            | `?page=1&limit=20&status=paid&from=&to=`             |
| GET    | `/invoices/:id`                    | token            | One of your invoices                                 |
| POST   | `/invoices/:id/payment-link`       | token            | Returns the Stripe Checkout `url`                    |
| GET    | `/public/invoices/:token`          |                  | The invoice for the customer                         |
| POST   | `/public/invoices/:token/checkout` |                  | Returns the Stripe Checkout `url` for the customer   |
| GET    | `/payment/success?session_id=`     |                  | Page Stripe returns to after paying                  |
| GET    | `/payment/cancel`                  |                  | Page Stripe returns to when the customer goes back   |
| POST   | `/webhooks/stripe`                 | Stripe signature | Stripe events                                        |
| POST   | `/imports`                         | token            | Upload a CSV in the `file` field, returns the import |
| GET    | `/imports`                         | token            | Your imports, newest first                           |
| GET    | `/imports/:id`                     | token            | One import with its status and errors                |

Notes:

- `amount` is in the smallest unit: `15000` is 150.00. `currency` is `usd`, `eur` or `egp`.
- Creating an invoice returns `publicToken` once. The share link is `/v1/public/invoices/<publicToken>`.
- Invoice status: `pending`, `paid`, `expired`, `cancelled`. Payment status: `pending`, `succeeded`, `failed`, `expired`, `refunded`. Import status: `pending`, `processing`, `completed`, `failed`.
- Auth routes allow 5 requests per minute, the rest 100.

## How a payment works

1. The owner creates an invoice. It starts as `pending`.
2. The owner or the customer asks for a checkout link. The API creates a Stripe Checkout Session with the amount from the database and saves a `pending` payment. If an open session already exists, the same link is returned.
3. The customer pays on the Stripe page and is sent back to `/v1/payment/success`.
4. Stripe calls `POST /v1/webhooks/stripe`. The API checks the signature, skips events it already handled, checks that the session, amount and currency match the invoice, then marks the payment `succeeded` and the invoice `paid`.
5. The owner gets an email. A failed async payment also sends an email.

The redirect back does not mark anything as paid. Only the webhook does.

Events used: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. Other events are saved and ignored.

## How an import works

1. `POST /v1/imports` with a CSV file. The API saves the import as `pending`, puts a job in the `invoice-imports` queue and answers `202` with the import `id` right away.
2. A worker takes the job, marks the import `processing` and reads every row.
3. If every row is valid, all invoices are saved as `paid` and the import becomes `completed` with `importedCount`. If any row is wrong, nothing is saved and the import becomes `failed` with the errors, for example `Row 3: amount: ...`.
4. The user gets an email either way.
5. `GET /v1/imports/:id` shows the result.

The CSV looks like this (see `bruno/fixtures/invoices.csv`):

```csv
description,amount,currency,paid_at
Website design,15000,usd,2026-10-01
Logo,5000,eur,2026-10-02
```

The file can be up to 5 MB. The invoices belong to the user who uploads the file.

## Testing the webhook locally

Stripe cannot reach `localhost`, so use the [Stripe CLI](https://docs.stripe.com/stripe-cli):

```bash
stripe login
```

```bash
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired --forward-to localhost:3000/v1/webhooks/stripe
```

Put the `whsec_...` it prints in `STRIPE_WEBHOOK_SECRET` and restart the API. Then create an invoice, open its payment link and pay with the test card `4242 4242 4242 4242` (any future date, any CVC). The invoice turns `paid`.

If `stripe login` is connected to a different Stripe account than `STRIPE_SECRET_KEY`, no events arrive. Add `--api-key <your sk_test key>` to the `stripe listen` command to use the same account.

## Emails

Emails go through Mailtrap's sandbox, so nothing reaches a real inbox. Open your Mailtrap inbox to read them. The free plan allows 50 emails a month. If port `2525` is blocked on your network, use `587`.

## Bruno

The `bruno/` folder is a [Bruno](https://www.usebruno.com/) collection with every request.

1. Open Bruno, choose **Open Collection** and pick the `bruno` folder.
2. Select the `local` environment (top right).
3. Run `auth/Register` once, then `auth/Login`. Login saves the token for the other requests.
4. `invoices/Create Invoice` saves `invoiceId` and `publicToken`. Open the `url` from `Payment Link` in a browser to pay.
5. `imports/Upload Import` uploads `fixtures/invoices.csv` and saves `importId`. Send `imports/Get Import` until the status is `completed`. To see a failed import, pick `fixtures/bad-invoices.csv` in the Body tab.

## Tests

```bash
npm test
```

```bash
npm run test:e2e
```

The e2e tests need Postgres and Redis from `docker compose up -d`. They use the database from `.env` and delete what they create. Stripe and the mail service are mocked and webhook events are signed with a test secret, so no real calls or emails are made.

## Database

```bash
npm run db:generate -- --name <change>
```

```bash
npm run db:migrate
```

## Known limitations

- Refunds are not handled. A refund made in the Stripe Dashboard does not change the invoice.
- Invoices do not expire on their own. An expired invoice is marked `expired` when someone asks for a payment link.
- There is no endpoint to cancel an invoice yet.
- The public token is shown only when the invoice is created.
- Uploading the same CSV twice imports the invoices twice.
- Imports accept CSV only, not Excel.
