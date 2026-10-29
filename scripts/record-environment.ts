import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const exec = promisify(execFile);
export async function recordEnvironment() {
  const docker = async (args: string[]) => (await exec('docker', args, { windowsHide: true, timeout: 15000 })).stdout.trim();
  const compose = ['compose', '--env-file', resolve('.runtime/lab/compose.env'), '-f', resolve('infra/compose/compose.yaml')];
  const manifest = JSON.parse(await readFile('infra/versions.json', 'utf8'));
  const volumes = [];
  for (const name of ['v1', 'v2', 'v3', 'v4', 'rpc']) {
    const output = await docker([...compose, 'exec', '-T', name, 'du', '-sb', '/data']);
    volumes.push({ instance: name, dataBytes: output.split(/\s+/)[0] });
  }
  const environment = {
    recordedAt: new Date().toISOString(), hostPlatform: process.platform, hostArch: process.arch,
    node: process.versions.node, npm: manifest.npm,
    docker: JSON.parse(await docker(['info', '--format', '{"architecture":"{{.Architecture}}","os":"{{.OperatingSystem}}","cpu":{{.NCPU}},"memoryBytes":{{.MemTotal}},"serverVersion":"{{.ServerVersion}}"}'])),
    compose: await docker(['compose', 'version', '--short']),
    postgres: await docker([...compose, 'exec', '-T', 'postgres', 'postgres', '--version']),
    applicationImageId: await docker(['image', 'inspect', 'bpc-console:0.0.0', '--format', '{{.Id}}']),
    externalImages: manifest.images, dataVolumes: volumes,
  };
  await writeFile('.runtime/lab/evidence/environment.json', JSON.stringify(environment, null, 2) + '\n');
}
