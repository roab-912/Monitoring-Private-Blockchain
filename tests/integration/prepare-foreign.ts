import { mkdir,readFile,writeFile,lstat } from 'node:fs/promises';
import { generatePrivateKey } from 'viem/accounts';
await mkdir('.runtime/lab/foreign',{recursive:true,mode:0o700});
if((await lstat('.runtime/lab/foreign')).isSymbolicLink())throw new Error('Symlinked qualification directory rejected');
const genesis=JSON.parse(await readFile('.runtime/lab/genesis.json','utf8'));
genesis.timestamp='0x1';
try {await writeFile('.runtime/lab/foreign/node.key',generatePrivateKey().slice(2),{flag:'wx',mode:0o600});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
await writeFile('.runtime/lab/foreign/genesis.json',JSON.stringify(genesis,null,2)+'\n');
console.log('Isolated foreign-genesis qualification fixture prepared; distinct local identity');
