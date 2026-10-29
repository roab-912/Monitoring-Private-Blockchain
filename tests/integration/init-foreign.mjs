import {readFileSync,writeFileSync,existsSync,lstatSync,chownSync,chmodSync} from 'node:fs';
for(const directory of ['/foreign/data','/foreign/keys'])if(lstatSync(directory).isSymbolicLink())throw new Error('Unsafe foreign volume');
chownSync('/foreign/data',1000,1000);
const file='/foreign/keys/node_key';const key=readFileSync('/run/secrets/foreign_key');
if(existsSync(file)){if(lstatSync(file).isSymbolicLink()||!readFileSync(file).equals(key))throw new Error('Foreign identity mismatch');}
else{writeFileSync(file,key,{flag:'wx',mode:0o400});chownSync(file,1000,1000);}
chownSync('/foreign/keys',0,0);chmodSync('/foreign/keys',0o700);chownSync('/foreign/keys',1000,1000);
