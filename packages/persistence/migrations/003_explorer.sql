ALTER TABLE networks ADD COLUMN ownership text NOT NULL DEFAULT 'managed' CHECK (ownership IN ('managed','imported'));
ALTER TABLE networks ADD COLUMN expected_genesis_hash text CHECK (expected_genesis_hash ~ '^0x[0-9a-f]{64}$');
ALTER TABLE networks ALTER COLUMN genesis DROP NOT NULL;
ALTER TABLE networks ALTER COLUMN genesis_file_sha256 DROP NOT NULL;
ALTER TABLE networks ADD CONSTRAINT managed_genesis_required CHECK (ownership='imported' OR (genesis IS NOT NULL AND genesis_file_sha256 IS NOT NULL));
UPDATE networks SET expected_genesis_hash=genesis_block_hash WHERE genesis_block_hash IS NOT NULL;
CREATE UNIQUE INDEX networks_identity ON networks(chain_id,expected_genesis_hash) WHERE expected_genesis_hash IS NOT NULL;
ALTER TABLE operations DROP CONSTRAINT operations_kind_check;
ALTER TABLE operations ADD CONSTRAINT operations_kind_check CHECK (kind IN ('foundation.check','network.connect'));

CREATE TABLE explorer_connection (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), network_id uuid NOT NULL REFERENCES networks,
  source_ids jsonb NOT NULL CHECK(jsonb_typeof(source_ids)='array' AND jsonb_array_length(source_ids) BETWEEN 1 AND 3),
  generation bigint NOT NULL DEFAULT 1, verified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE index_cursors (
  network_id uuid PRIMARY KEY REFERENCES networks, next_block numeric(78,0) NOT NULL DEFAULT 0 CHECK(next_block>=0),
  last_hash text CHECK(last_hash ~ '^0x[0-9a-f]{64}$'), state text NOT NULL DEFAULT 'CONNECTING'
    CHECK(state IN ('CONNECTING','INDEXING','CAUGHT_UP','RPC_UNAVAILABLE','DIVERGED','INVALID_SOURCE','MISSING_RECEIPT','INVALID_DATA','LIMIT_EXCEEDED')),
  observed_head numeric(78,0), last_observed_at timestamptz, last_indexed_at timestamptz,
  heartbeat_at timestamptz, incident_code text, incident_height numeric(78,0),
  observations jsonb NOT NULL DEFAULT '[]', CHECK ((next_block=0) = (last_hash IS NULL))
);
CREATE TABLE chain_blocks (
  network_id uuid NOT NULL REFERENCES networks, height numeric(78,0) NOT NULL CHECK(height>=0),
  hash text NOT NULL CHECK(hash ~ '^0x[0-9a-f]{64}$'), parent_hash text NOT NULL CHECK(parent_hash ~ '^0x[0-9a-f]{64}$'),
  timestamp_seconds numeric(78,0) NOT NULL, state_root text NOT NULL, miner text NOT NULL,
  gas_limit numeric(78,0) NOT NULL, gas_used numeric(78,0) NOT NULL,
  source_ids jsonb NOT NULL, indexed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(network_id,height), UNIQUE(network_id,hash)
);
CREATE TABLE chain_transactions (
  network_id uuid NOT NULL, hash text NOT NULL CHECK(hash ~ '^0x[0-9a-f]{64}$'),
  block_height numeric(78,0) NOT NULL, transaction_index integer NOT NULL CHECK(transaction_index>=0),
  sender text NOT NULL, recipient text, value_wei numeric(78,0) NOT NULL, nonce numeric(78,0) NOT NULL,
  gas numeric(78,0) NOT NULL, gas_price numeric(78,0), input text NOT NULL, type text NOT NULL,
  PRIMARY KEY(network_id,hash), UNIQUE(network_id,block_height,transaction_index),
  FOREIGN KEY(network_id,block_height) REFERENCES chain_blocks(network_id,height)
);
CREATE INDEX transactions_sender ON chain_transactions(network_id,sender,block_height DESC,transaction_index DESC);
CREATE INDEX transactions_recipient ON chain_transactions(network_id,recipient,block_height DESC,transaction_index DESC);
CREATE TABLE chain_receipts (
  network_id uuid NOT NULL, transaction_hash text NOT NULL, status text NOT NULL CHECK(status IN ('success','reverted')),
  gas_used numeric(78,0) NOT NULL, cumulative_gas_used numeric(78,0) NOT NULL, effective_gas_price numeric(78,0), contract_address text,
  PRIMARY KEY(network_id,transaction_hash), FOREIGN KEY(network_id,transaction_hash) REFERENCES chain_transactions(network_id,hash)
);
CREATE INDEX receipts_contract ON chain_receipts(network_id,contract_address) WHERE contract_address IS NOT NULL;
CREATE TABLE chain_logs (
  network_id uuid NOT NULL, block_height numeric(78,0) NOT NULL, log_index integer NOT NULL CHECK(log_index>=0),
  transaction_hash text NOT NULL, address text NOT NULL, topics jsonb NOT NULL, data text NOT NULL,
  PRIMARY KEY(network_id,block_height,log_index),
  FOREIGN KEY(network_id,transaction_hash) REFERENCES chain_receipts(network_id,transaction_hash),
  FOREIGN KEY(network_id,block_height) REFERENCES chain_blocks(network_id,height)
);
CREATE INDEX logs_address ON chain_logs(network_id,address,block_height DESC,log_index DESC);
CREATE TABLE api_rate_limits (
  subject_hash text NOT NULL, bucket text NOT NULL CHECK(bucket IN ('read','write')),
  window_start timestamptz NOT NULL, hits integer NOT NULL CHECK(hits>0), PRIMARY KEY(subject_hash,bucket)
);

GRANT INSERT(id,name,chain_id,network_id,expected_genesis_hash,ownership,consensus,besu_version) ON networks TO bpc_api;
GRANT SELECT ON explorer_connection,index_cursors,chain_blocks,chain_transactions,chain_receipts,chain_logs TO bpc_api,bpc_worker;
GRANT SELECT,INSERT,UPDATE ON api_rate_limits TO bpc_api;
GRANT INSERT,UPDATE ON explorer_connection,index_cursors TO bpc_worker;
GRANT INSERT ON chain_blocks,chain_transactions,chain_receipts,chain_logs TO bpc_worker;
GRANT UPDATE(genesis_block_hash,besu_version) ON networks TO bpc_worker;
