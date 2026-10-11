import { defineConfig } from '@playwright/test';

/* One browser pass against a production build backed by the local file store
   (DB_DRIVER=file), seeded fresh from seed.json. No Supabase, Anthropic or GitHub calls are made.
   Run `npm run build` first. */
const PORT = 3210;
const env = {
  DB_DRIVER: 'file',
  DB_FILE: '.data/e2e.json',
  APP_PASSWORD: 'e2e-password-not-real',
  // Placeholders so the page shows Talk, Sync and Generate as it would when configured.
  // The tests never click anything that would call GitHub or Anthropic.
  GITHUB_TOKEN: 'placeholder-not-a-token',
  ANTHROPIC_API_KEY: 'placeholder-not-a-key',
};

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: `rm -f .data/e2e.json && tsx scripts/seed.ts && next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    env,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
