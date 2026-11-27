import { defineConfig } from '@playwright/test';
import { base } from './test/browser/planning-data.mjs';

export default defineConfig({
  testDir:'./test/browser',
  workers:1,
  timeout:55_000,
  expect:{timeout:16_000},
  reporter:'list',
  use:{
    baseURL:base,
    viewport:{width:1530,height:1020},
    ...(process.env.ROTA_TEST_CHROME ? {channel:'chrome'}:{}),
    trace:'retain-on-failure',
  },
  webServer:{
    command:'node test/browser/planning-server.mjs',
    url:base+'/api/version',
    timeout:120_000,
  },
});
