import { neon } from '@neondatabase/serverless';

export function getDb() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.VITE_DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Please configure DATABASE_URL in Vercel or .env');
  }
  return neon(url);
}
