import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('viewer sees declared inventory and failure domain but cannot enqueue', async ({ page }) => {
  const tokens = JSON.parse(await readFile('.runtime/lab/auth/tokens.json', 'utf8'));
  await page.goto('/');
  await page.getByLabel('Jeton du laboratoire isolé').fill(tokens.Viewer);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.getByRole('button',{name:'Socle et inventaire'}).click();
  await expect(page.getByText(/Un seul domaine de panne physique/)).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'Vérifier PostgreSQL via le worker' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByLabel('Jeton du laboratoire isolé')).toBeVisible();
});
test('administrator receives a durable worker proof', async ({ page }) => {
  const tokens = JSON.parse(await readFile('.runtime/lab/auth/tokens.json', 'utf8'));
  await page.goto('/');
  await page.getByLabel('Jeton du laboratoire isolé').fill(tokens.Administrator);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.getByRole('button',{name:'Socle et inventaire'}).click();
  await page.getByRole('button', { name: 'Vérifier PostgreSQL via le worker' }).click();
  await expect(page.getByText('SUCCEEDED', { exact: true })).toBeVisible();
  await expect(page.getByText(/Preuve : base joignable, 5 instances/)).toBeVisible();
});
test('invalid token yields an explicit denial', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Jeton du laboratoire isolé').fill('invalid-token');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Authentification refusée');
});
