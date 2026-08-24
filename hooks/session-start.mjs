#!/usr/bin/env node
/**
 * SessionStart hook for the TFast Ads Manager plugin.
 *
 * Runs once at the start of every session. Two jobs:
 *   1. Inject today's date into the agent's context (so prompts like "this week" work).
 *   2. Compare local plugin version to the latest release; prompt to update if outdated.
 *
 * Never blocks: every step has a tight timeout and silent failure mode.
 * Output protocol: JSON on stdout with optional `systemMessage` + `additionalContext`.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || process.env.PLUGIN_ROOT || process.cwd();
const VERSION_URL = process.env.TFAST_VERSION_URL || 'https://raw.githubusercontent.com/tfastdigital/tfast-ads-manager/main/.claude-plugin/plugin.json';
const NET_TIMEOUT_MS = 2500;

// ─── Local version from the bundled manifest ──────────────────
function readLocalVersion() {
  for (const sub of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    const p = join(PLUGIN_ROOT, sub);
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, 'utf-8')).version || null;
      } catch { /* fall through */ }
    }
  }
  return null;
}

// ─── Network helpers with timeout ─────────────────────────────
async function withTimeout(p, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await p(ctrl.signal); }
  finally { clearTimeout(t); }
}

async function fetchRemoteVersion() {
  try {
    return await withTimeout(async (signal) => {
      const res = await fetch(VERSION_URL, { signal });
      if (!res.ok) return null;
      const j = await res.json();
      return j.version || null;
    }, NET_TIMEOUT_MS);
  } catch { return null; }
}

// ─── Semver compare: -1 = a<b, 0 = equal, 1 = a>b ─────────────
function semverCmp(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// ─── Run all checks in parallel, then build the message ───────
const localVersion = readLocalVersion();
const remoteVersion = await fetchRemoteVersion();

const lines = [];
lines.push(`TFast Ads Manager v${localVersion ?? 'unknown'} loaded.`);
lines.push('Ad accounts are managed through the TFast Ads Manager server connection registry.');

if (localVersion && remoteVersion && semverCmp(localVersion, remoteVersion) < 0) {
  lines.push('');
  lines.push(`⚠️  Update available: v${remoteVersion} (you have v${localVersion}). To update:`);
  lines.push(`    cd ${PLUGIN_ROOT}`);
  lines.push('    git pull && npm run build');
  lines.push('    # then re-copy the folder to your plugin install path');
}

const today = new Date().toISOString().slice(0, 10);
console.log(JSON.stringify({
  systemMessage: lines.join('\n'),
  additionalContext: `Today's date is ${today}.`,
}));
