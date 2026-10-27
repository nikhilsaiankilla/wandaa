import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDb(connectionString: string) {
  const client = postgres(connectionString, { prepare: false, max: 1 });
  return drizzle({ client, schema });
}

export type Database = ReturnType<typeof createDb>;

// Global cache for Next.js hot reload
declare global {
  var _drizzleDb: { connectionString: string; db: Database } | undefined;
}

export function getDb(): Database {
  const connectionString =  process.env.DATABASE_URL || 'postgresql://postgres.bvjmpxtyajbqlyrsllnn:Nikhilsai0146@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
  if (!connectionString) throw new Error("DATABASE_URL is required to connect to PostgreSQL.");

  if (!globalThis._drizzleDb || globalThis._drizzleDb.connectionString !== connectionString) {
    globalThis._drizzleDb = { connectionString, db: createDb(connectionString) };
  }

  return globalThis._drizzleDb.db;
}
