/**
 * Compatibility adapter: Redirects all Supabase client calls to the Neon Serverless Client.
 */
export * from './neonClient';
export { neonClient as supabase } from './neonClient';
