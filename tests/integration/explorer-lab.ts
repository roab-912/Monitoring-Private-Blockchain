import { mkdir,copyFile,writeFile } from 'node:fs/promises';
import { compose,run } from '../../scripts/lab-lib.js';
await mkdir('.runtime/lab/evidence',{recursive:true});
await writeFile('.runtime/lab/evidence/explorer-run.json',JSON.stringify({startedAt:new Date().toISOString(),state:'RUNNING'}));
const probe=(phase:string)=>compose(['run','--rm','--no-deps','verifier','node','--import','tsx','tests/integration/explorer-probe.ts',phase]);
try {
  await run(process.execPath,['--import','tsx','tests/integration/prepare-foreign.ts']);
  await probe('baseline');
  await compose(['kill','-s','SIGKILL','worker']);
  try{await probe('worker-down');}finally{await compose(['start','worker']);}
  await probe('resumed');
  await compose(['stop','rpc']);
  try{await probe('rpc-down');}finally{await compose(['start','rpc']);}
  await probe('rpc-recovered');
  await compose(['--profile','qualification','up','-d','foreign']);
  await compose(['stop','worker']);
  try{await probe('faults');}finally{await compose(['start','worker']);await compose(['--profile','qualification','stop','foreign']);}
  await writeFile('.runtime/lab/evidence/explorer-run.json',JSON.stringify({completedAt:new Date().toISOString(),state:'SUCCEEDED',scenarios:['v0.1','T02','T03']},null,2)+'\n');
  await mkdir('docs/evidence/v0.1',{recursive:true});
  for(const name of ['baseline','worker-down','resumed','rpc-down','rpc-recovered','faults','run'])await copyFile(`.runtime/lab/evidence/explorer-${name}.json`,`docs/evidence/v0.1/${name}.json`);
}catch(error){await writeFile('.runtime/lab/evidence/explorer-run.json',JSON.stringify({completedAt:new Date().toISOString(),state:'FAILED'}));throw error;}
