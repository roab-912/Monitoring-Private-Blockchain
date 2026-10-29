import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const solc = require('solc') as { compile: (input: string) => string; version: () => string };
const source = await readFile('packages/contracts/Witness.sol', 'utf8');
const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'Witness.sol': { content: source } },
  settings: { evmVersion: 'berlin', optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } },
}))) as { errors?: { severity: string; formattedMessage: string }[]; contracts: Record<string, Record<string, { abi: unknown; evm: { bytecode: { object: string }; deployedBytecode: { object: string } } }>> };
if (output.errors?.some(error => error.severity === 'error')) throw new Error(JSON.stringify(output.errors));
const contract = output.contracts['Witness.sol'].Witness;
await mkdir('dist/contracts', { recursive: true });
await writeFile('dist/contracts/Witness.json', JSON.stringify({ compiler: solc.version(), evmVersion: 'berlin',
  sourceSha256: createHash('sha256').update(source).digest('hex'), abi: contract.abi,
  bytecode: `0x${contract.evm.bytecode.object}`, deployedBytecode: `0x${contract.evm.deployedBytecode.object}` }, null, 2) + '\n');
console.log(`Witness compiled: ${solc.version()}, EVM berlin`);
