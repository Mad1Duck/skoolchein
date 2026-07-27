import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: databaseUrl
    ? { url: databaseUrl }
    : {
      host: process.env.DB_HOST!,
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_NAME!,
      port: Number(process.env.DB_PORT ?? 5432),
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    },
  migrations: {
    // App tables are kept in the default `public` schema. Ponder's internal
    // tables live in a separate schema via DATABASE_SCHEMA. This separation
    // prevents Ponder's build-id reset logic from colliding with or dropping
    // the Drizzle-managed application tables on every deploy.
    schema: 'public',
  },
});
