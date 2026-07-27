import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;
const databaseSchema = process.env.DATABASE_SCHEMA ?? 'public';

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
    // Keep the migrations journal (and unqualified CREATE statements) in the
    // same schema Ponder uses via DATABASE_SCHEMA. This prevents the mismatch
    // where Drizzle tables land in `public` while Ponder expects `skoolcein`.
    schema: databaseSchema,
  },
});
