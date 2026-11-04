import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

/**
 * Load `.env.local` first, then `.env`, without overwriting variables already
 * set by the shell. This is the TypeScript twin of `scripts/load-env.mjs`,
 * which the plain-Node tooling uses; keep the two in step.
 */
export function loadEnv(): void {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;

    try {
      loadEnvFile(file);
    } catch (error) {
      console.error(
        `[env] could not load ${file}:`,
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  }
}
