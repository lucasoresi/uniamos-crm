// test/servicios-bloqueados.spec.js
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

test.describe('Servicios', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/app.html`);
    await page.waitForSelector('.sb-item', { timeout: 10000 });
    await page.click('.sb-item:has-text("Servicios")');
    await page.waitForSelector('h2:has-text("Catálogo de Servicios")', { timeout: 5000 });
  });

  test('muestra la vista de catálogo', async ({ page }) => {
    await expect(page.locator('h2')).toContainText('Catálogo de Servicios');
    await expect(page.locator('text=La IA analiza')).toBeVisible();
  });

  test('puede agregar un servicio', async ({ page }) => {
    await page.click('button:has-text("Nuevo servicio")');
    await page.fill('input[placeholder*="sitio web"]', 'Test Service');
    await page.fill('input[type="number"]', '150');
    await page.click('button:has-text("Agregar servicio")');
    await expect(page.locator('text=Test Service')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Bloqueados', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/app.html`);
    await page.waitForSelector('.sb-item', { timeout: 10000 });
    await page.click('.sb-item:has-text("Bloqueados")');
    await page.waitForSelector('h2:has-text("Contactos Bloqueados")', { timeout: 5000 });
  });

  test('muestra la vista de bloqueados', async ({ page }) => {
    await expect(page.locator('h2')).toContainText('Contactos Bloqueados');
  });

  test('puede agregar un email bloqueado', async ({ page }) => {
    await page.fill('input[placeholder*="spam@"]', 'test-block@ejemplo.com');
    await page.click('button:has-text("Agregar")');
    await expect(page.locator('text=test-block@ejemplo.com')).toBeVisible({ timeout: 5000 });
  });
});
