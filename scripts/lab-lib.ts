import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
export const composeFile = resolve('infra/compose/compose.yaml');
export async function run(command: string, args: string[]) {
  return new Promise<void>((accept, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false, windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? accept() : reject(new Error(`${command} failed (${code})`)));
  });
}
export function compose(args: string[]) { return run('docker', ['compose', '--env-file', resolve('.runtime/lab/compose.env'), '-f', composeFile, ...args]); }
export const labNetworkId = '00000000-0000-4000-8000-000000000001';
export const labMachineId = '00000000-0000-4000-8000-000000000002';
