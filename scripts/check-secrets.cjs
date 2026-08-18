#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');

// Get staged files
let stagedFiles;
try {
  stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
} catch {
  process.exit(0);
}

if (stagedFiles.length === 0) process.exit(0);

// Block committing these files entirely
const blockedFiles = [
  '.env',
  '.env.local',
  '.env.production',
  '.claude/settings.local.json',
];

const stagedBlocked = stagedFiles.filter(f => blockedFiles.includes(f));
if (stagedBlocked.length > 0) {
  console.error('\n BLOCKED: You are trying to commit a sensitive file:');
  stagedBlocked.forEach(f => console.error(`   - ${f}`));
  console.error('\n These files contain API keys and must never be committed.');
  console.error(' Run:  git restore --staged <file>  to unstage them.\n');
  process.exit(1);
}

// Scan staged file contents for secret patterns
const secretPatterns = [
  { pattern: /sk-ant-api[0-9]{2}-[A-Za-z0-9_-]{90,}/, name: 'Anthropic API Key' },
  { pattern: /AIzaSy[A-Za-z0-9_-]{33}/, name: 'Google API Key (AIzaSy format)' },
  { pattern: /ghp_[A-Za-z0-9]{36}/, name: 'GitHub Personal Access Token' },
  { pattern: /AQ\.Ab8RN6[A-Za-z0-9_-]+/, name: 'Google AI Studio Key' },
  { pattern: /AKIA[0-9A-Z]{16}/, name: 'AWS Access Key' },
];

let foundSecrets = false;

for (const file of stagedFiles) {
  // Skip binary and lock files
  if (/\.(png|jpg|jpeg|gif|ico|mp3|wav|pdf|lock)$/.test(file)) continue;

  let content;
  try {
    content = execSync(`git show ":${file}"`, { encoding: 'utf8' });
  } catch {
    continue;
  }

  for (const { pattern, name } of secretPatterns) {
    if (pattern.test(content)) {
      console.error(`\n BLOCKED: ${name} detected in: ${file}`);
      foundSecrets = true;
    }
  }
}

if (foundSecrets) {
  console.error('\n Remove the secrets from those files before committing.');
  console.error(' Store all API keys in your .env file (which is git-ignored).\n');
  process.exit(1);
}

console.log('Security check passed — no secrets detected.');
process.exit(0);
