# Payment API

Invoices with Stripe Checkout. A user creates an invoice, shares a link, and the customer pays it on Stripe without an account. Stripe tells the API about the payment through a webhook, and the invoice becomes `paid`.

Built with NestJS, PostgreSQL, Drizzle ORM, Zod and Stripe (test mode).

## Setup

You need Node 22, Docker and a Stripe account in test mode.

```bash
npm install
cp .env.example .env
docker compose up -d
npm run db:migrate
npm run start:dev
```

The API runs on `http://localhost:3000/v1`. Check it with `GET /v1/health`.

## Environment variables

| Name                    | Example                                                        |
| ----------------------- | -------------------------------------------------------------- |
| `DATABASE_URL`          | `postgresql://postgres:postgres@localhost:5433/payments_db`    |
| `JWT_SECRET`            | at least 32 characters                                         |
| `APP_URL`               | `http://localhost:5173` (where Stripe sends the customer back) |
| `STRIPE_SECRET_KEY`     | `sk_test_...` from Stripe Dashboard > Developers > API keys    |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` printed by `stripe listen`                         |

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Postgres runs in Docker on port `5433`.

## Endpoints

All routes start with `/v1`. Routes marked "token" need `Authorization: Bearer <accessToken>` from login.

| Method | Route                              | Auth             | What it does                                       |
| ------ | ---------------------------------- | ---------------- | -------------------------------------------------- |
| GET    | `/health`                          |                  | API and database status                            |
| POST   | `/auth/register`                   |                  | `{ name, email, password }`                        |
| POST   | `/auth/login`                      |                  | `{ email, password }`, returns `accessToken`       |
| GET    | `/auth/me`                         | token            | Current user                                       |
| POST   | `/invoices`                        | token            | `{ description, amount, currency, expiresAt? }`    |
| GET    | `/invoices`                        | token            | `?page=1&limit=20&status=paid&from=&to=`           |
| GET    | `/invoices/:id`                    | token            | One of your invoices                               |
| POST   | `/invoices/:id/payment-link`       | token            | Returns the Stripe Checkout `url`                  |
| GET    | `/public/invoices/:token`          |                  | The invoice for the customer                       |
| POST   | `/public/invoices/:token/checkout` |                  | Returns the Stripe Checkout `url` for the customer |
| POST   | `/webhooks/stripe`                 | Stripe signature | Stripe events                                      |

Notes:

- `amount` is in cents: `15000` is 150.00. `currency` is `usd` or `eur`.
- Creating an invoice returns `publicToken` once. The share link is `/v1/public/invoices/<publicToken>`.
- Invoice status: `pending`, `paid`, `expired`, `cancelled`. Payment status: `pending`, `succeeded`, `failed`, `expired`, `refunded`.
- Auth routes allow 5 requests per minute, the rest 100.

## How a payment works

1. The owner creates an invoice. It starts as `pending`.
2. The owner or the customer asks for a checkout link. The API creates a Stripe Checkout Session with the amount from the database and saves a `pending` payment. If an open session already exists, the same link is returned.
3. The customer pays on the Stripe page.
4. Stripe calls `POST /v1/webhooks/stripe`. The API checks the signature, skips events it already handled, checks that the session, amount and currency match the invoice, then marks the payment `succeeded` and the invoice `paid`.

The redirect back to `APP_URL` does not mark anything as paid. Only the webhook does.

Events used: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. Other events are saved and ignored.

## Testing the webhook locally

Stripe cannot reach `localhost`, so use the [Stripe CLI](https://docs.stripe.com/stripe-cli):

```bash
stripe login
```

```bash
stripe listen --forward-to localhost:3000/v1/webhooks/stripe
```

Put the `whsec_...` it prints in `STRIPE_WEBHOOK_SECRET` and restart the API. Then create an invoice, open its payment link and pay with the test card `4242 4242 4242 4242` (any future date, any CVC). The invoice turns `paid`.

## Bruno

The `bruno/` folder is a [Bruno](https://www.usebruno.com/) collection with every request.

1. Open Bruno, choose **Open Collection** and pick the `bruno` folder.
2. Select the `local` environment (top right).
3. Run the requests in this order: `auth/Register`, `auth/Login`, then anything in `invoices` and `public`.

`Register` makes a new email each time, `Login` saves the token, and `Create Invoice` saves `invoiceId` and `publicToken`, so the next requests work without copying anything. Open the `url` from `Payment Link` in a browser to pay.

You can also run the whole collection from the terminal while the API is running:

```bash
cd bruno && npx @usebruno/cli run -r --env local
```

## Tests

```bash
npm test
```

```bash
npm run test:e2e
```

The e2e tests use the database from `.env` and delete what they create. Stripe is mocked, and webhook events are signed with a test secret, so no real calls are made.

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
