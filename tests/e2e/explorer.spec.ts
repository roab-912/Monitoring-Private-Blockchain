import { test,expect,type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
async function login(page:Page,role='Viewer') {
  const tokens=JSON.parse(await readFile('.runtime/lab/auth/tokens.json','utf8'));
  await page.goto('/');await page.getByLabel('Jeton du laboratoire isolé').fill(tokens[role]);
  await page.getByRole('button',{name:'Se connecter',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Réseau observé'})).toBeVisible();
}
async function search(page:Page,value:string) {
  await page.getByLabel('Rechercher un numéro de bloc, un hash ou une adresse').fill(value);
  await page.getByRole('button',{name:'Rechercher',exact:true}).click();
}
test('viewer explores real blocks with stable cursor pagination and hash search',async({page})=>{
  await login(page);
  await expect(page.getByText('Réseau géré',{exact:false})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Connexion à une chaîne existante'})).toHaveCount(0);
  await page.getByRole('link',{name:'Blocs',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Blocs indexés'})).toBeVisible();
  const first=await page.locator('tbody tr').first().locator('td').first().innerText();
  await page.getByRole('button',{name:'Page suivante',exact:true}).click();
  await expect.poll(async()=>BigInt(await page.locator('tbody tr').first().locator('td').first().innerText())<BigInt(first)).toBe(true);
  await page.getByRole('button',{name:'Revenir aux plus récents'}).click();
  await expect.poll(async()=>BigInt(await page.locator('tbody tr').first().locator('td').first().innerText())>=BigInt(first)).toBe(true);
  const witness=JSON.parse(await readFile('.runtime/lab/evidence/before.json','utf8'));
  await search(page,witness.contract.writeBlockHash);
  await expect(page.getByRole('heading',{name:`Bloc ${witness.contract.writeBlock}`,exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Transactions du bloc'})).toBeVisible();
});
test('real success, revert, contract creation, logs and address history are distinct',async({page})=>{
  const witness=JSON.parse(await readFile('.runtime/lab/evidence/before.json','utf8'));
  await login(page);await search(page,witness.contract.writeHash);
  await expect(page.getByRole('heading',{name:'Reçu indexé'})).toBeVisible();
  await expect(page.getByText('Réussie',{exact:true})).toBeVisible();
  await expect(page.locator('.logs article').first()).toContainText(BigInt(witness.contract.value).toString(16).padStart(64,'0'));
  await search(page,witness.contract.revertHash);
  await expect(page.getByText('Annulée (revert)',{exact:true})).toBeVisible();
  await expect(page.getByText('Aucun log dans cette page.')).toBeVisible();
  await search(page,witness.contract.deploymentHash);
  await expect(page.getByText('Contrat créé',{exact:true})).toBeVisible();
  await search(page,witness.contract.address);
  await expect(page.getByRole('heading',{name:'Adresse',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Historique des transactions'})).toBeVisible();
  await expect(page.getByText('Création de contrat observée dans l’index.',{exact:false})).toBeVisible();
});
test('administrator registers a verified connection through a real worker job',async({page})=>{
  await login(page,'Administrator');
  await page.getByRole('button',{name:'Vérifier et enregistrer la connexion'}).click();
  await expect(page.getByText('SUCCEEDED',{exact:true})).toBeVisible({timeout:30000});
  await expect(page.getByText('Connexion vérifiée au genesis',{exact:false})).toBeVisible();
});
test('unindexed transaction has no fabricated receipt',async({page})=>{
  await login(page);await page.goto(`/#/transactions/0x${'9'.repeat(64)}`);
  await expect(page.getByText('Transaction absente de l’index ou service indisponible. Aucun reçu réussi ne peut être déduit.')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Reçu indexé'})).toHaveCount(0);
});
