/**
 * TFast Ads Manager — server configuration.
 * All secrets are loaded server-side from the repo-root .env (gitignored).
 * NEVER import this module in frontend code.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load the repo-root .env regardless of the process working directory.
const HERE = dirname(fileURLToPath(import.meta.url)); // server/src
dotenv.config({ path: join(HERE, '..', '..', '.env') });

const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  DEEPSEEK_API_KEY: z.string().min(1, 'DEEPSEEK_API_KEY is required'),
  DEEPSEEK_BASE_URL: z.string().default('https://api.deepseek.com'),
  APIDIRECT_API_KEY: z.string().min(1, 'APIDIRECT_API_KEY is required'),
  APIDIRECT_API_KEY_LIVE: z.string().optional(),
  APIDIRECT_BASE_URL: z.string().default('https://apidirect.io'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  PORT: z.coerce.number().default(8787),
  LOG_LEVEL: z.string().default('info'),
  TIKTOK_MCP_URL: z.string().default('https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer'),
  TIKTOK_MCP_TOKEN: z.string().optional(),
  TIKTOK_MCP_REDIRECT_URI: z.string().default('http://127.0.0.1:8787/api/v1/oauth/tiktok-mcp/callback'),
  TIKTOK_APP_ID: z.string().optional(),
  TIKTOK_APP_SECRET: z.string().optional(),
  TIKTOK_REDIRECT_URI: z.string().optional(),
  TIKTOK_MOCK_OAUTH: z.preprocess(
    // z.coerce.boolean() would treat the STRING "false" as true — parse truthy words instead.
    (v) => v === true || ['true', '1', 'yes', 'on'].includes(String(v ?? '').trim().toLowerCase()),
    z.boolean(),
  ).default(false),
  META_MCP_URL: z.string().optional(),
  META_MCP_TOKEN: z.string().optional(),
  GOOGLE_MCP_URL: z.string().optional(),
  GOOGLE_MCP_TOKEN: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`   - ${issue.message}`);
  process.exit(1);
}

export const config = parsed.data;

/** Redact secrets before logging config. */
export function redactedConfig() {
  const c = { ...config } as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    if (k.includes('KEY') || k.includes('TOKEN') || k.includes('SECRET')) c[k] = '••••••••';
  }
  return c;
}
