import { chownSync, readFileSync, writeFileSync, existsSync, lstatSync, chmodSync } from 'node:fs';
// Fixed mount targets only. No recursion, deletion, shell, user paths or key generation.
for (const name of ['v1', 'v2', 'v3', 'v4', 'rpc']) {
  const data = `/volumes/${name}/data`;
  const directory = `/volumes/${name}/keys`;
  if (lstatSync(data).isSymbolicLink() || lstatSync(directory).isSymbolicLink()) throw new Error('Unsafe volume');
  chownSync(data, 1000, 1000);
  const keyFile = `${directory}/node_key`;
  const key = readFileSync(`/run/secrets/${name}_key`);
  if (existsSync(keyFile)) {
    if (lstatSync(keyFile).isSymbolicLink() || !readFileSync(keyFile).equals(key)) throw new Error('Stored identity mismatch');
  } else {
    writeFileSync(keyFile, key, { flag: 'wx', mode: 0o400 });
    chownSync(keyFile, 1000, 1000);
  }
  chownSync(directory, 0, 0);
  chmodSync(directory, 0o700);
  chownSync(directory, 1000, 1000);
}
const postgresDirectory = '/volumes/postgres';
if (lstatSync(postgresDirectory).isSymbolicLink()) throw new Error('Unsafe PostgreSQL secrets volume');
for (const [source, name] of [['db_password', 'password'], ['db_init', '010-users.sql']]) {
  const target = `${postgresDirectory}/${name}`;
  const content = readFileSync(`/run/secrets/${source}`);
  if (existsSync(target)) {
    if (lstatSync(target).isSymbolicLink() || !readFileSync(target).equals(content)) throw new Error('PostgreSQL credential mismatch');
  } else {
    writeFileSync(target, content, { flag: 'wx', mode: 0o400 });
    chownSync(target, 999, 999);
  }
}
chownSync(postgresDirectory, 0, 0);
chmodSync(postgresDirectory, 0o700);
chownSync(postgresDirectory, 999, 999);
console.log('Dedicated data and key volume ownership verified');
