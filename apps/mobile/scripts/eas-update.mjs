#!/usr/bin/env node
// Publishes an OTA update to the channel of an eas.json build profile, bundled with the
// same EXPO_PUBLIC_* values as that profile's builds: the profile's `env` plus its EAS
// environment. Shell exports and .env (eas update skips it with --environment) never leak in.
//
//   npm run update:production -- --message "Fix scan copy"
//   npm run update:preview -- --message "Try new paywall"
//
// Anything after the profile name is passed to `eas update` (--platform ios, --rollout-percentage 10, ...).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const { build } = JSON.parse(readFileSync(join(appDir, 'eas.json'), 'utf8'));

function resolveProfile(name) {
  const profile = build[name];
  if (!profile) return null;
  const parent = profile.extends ? resolveProfile(profile.extends) : null;
  return { ...parent, ...profile, env: { ...parent?.env, ...profile.env } };
}

const [profileName, ...easArgs] = process.argv.slice(2);
const profile = profileName ? resolveProfile(profileName) : null;
if (!profile?.channel || !profile.environment) {
  const names = Object.keys(build).filter((name) => resolveProfile(name).channel);
  console.error(`Usage: node scripts/eas-update.mjs <${names.join('|')}> [eas update flags]`);
  process.exit(1);
}

const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('EXPO_PUBLIC_')),
);
Object.assign(env, profile.env);

console.log(
  `Publishing to channel "${profile.channel}" with the "${profile.environment}" EAS environment` +
    ` and eas.json env: ${Object.keys(profile.env).join(', ') || 'none'}`,
);
const { status } = spawnSync(
  'npx',
  [
    '--no-install',
    'eas',
    'update',
    '--channel',
    profile.channel,
    '--environment',
    profile.environment,
    ...easArgs,
  ],
  { cwd: appDir, env, stdio: 'inherit' },
);
process.exit(status ?? 1);
