import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests',use:{baseURL:process.env.FORGE_FRONTEND_URL??'http://localhost:18113',headless:true},reporter:'line',outputDir:'test-results'});
