import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

/**
 * Load .env.local first, then .env, without overwriting variables already set
 * by the shell. Node only fills in keys that are absent.
 */
export function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    if (existsSync(file)) {
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
}
