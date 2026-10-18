import 'dotenv/config';

import { defineConfig } from 'drizzle-kit';

// Used by the drizzle-kit CLI only (db:generate, db:migrate, db:studio).
// The app connects through src/database/database.service.ts.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
}

export default defineConfig({
  schema: './src/database/schema/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  strict: true,
  verbose: true,
  dbCredentials: {
    url: databaseUrl,
  },
});
