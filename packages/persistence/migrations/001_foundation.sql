CREATE TABLE networks (
  id uuid PRIMARY KEY, name text NOT NULL, chain_id numeric(78,0) NOT NULL CHECK (chain_id >= 0),
  network_id numeric(78,0) NOT NULL CHECK (network_id >= 0), genesis jsonb NOT NULL,
  genesis_file_sha256 text NOT NULL CHECK (genesis_file_sha256 ~ '^[0-9a-f]{64}$'),
  genesis_block_hash text CHECK (genesis_block_hash ~ '^0x[0-9a-f]{64}$'),
  consensus text NOT NULL CHECK (consensus = 'QBFT_HEADER'), besu_version text NOT NULL
);
CREATE TABLE machines (
  id uuid PRIMARY KEY, name text NOT NULL, network_id uuid NOT NULL REFERENCES networks,
  connection_mode text NOT NULL CHECK (connection_mode IN ('local','ssh')),
  address text NOT NULL, os text NOT NULL, architecture text NOT NULL, failure_domain text NOT NULL,
  secret_ref text, host_key_fingerprint text,
  CHECK (connection_mode <> 'ssh' OR (secret_ref IS NOT NULL AND host_key_fingerprint IS NOT NULL))
);
CREATE TABLE node_instances (
  id uuid PRIMARY KEY, network_id uuid NOT NULL REFERENCES networks, machine_id uuid NOT NULL REFERENCES machines,
  service_name text NOT NULL, purpose text NOT NULL CHECK (purpose IN ('consensus','rpc','exploration','backup')),
  p2p_identity text NOT NULL CHECK (p2p_identity ~ '^[0-9a-f]{128}$'),
  node_address text NOT NULL CHECK (node_address ~ '^0x[0-9a-f]{40}$'),
  besu_version text NOT NULL, storage_profile text NOT NULL CHECK (storage_profile IN ('BONSAI_FULL','FOREST_FULL')),
  cpu_millis integer NOT NULL CHECK (cpu_millis > 0), memory_bytes bigint NOT NULL CHECK (memory_bytes > 0),
  disk_budget_bytes bigint NOT NULL CHECK (disk_budget_bytes > 0),
  UNIQUE (machine_id, service_name), UNIQUE (network_id, node_address), UNIQUE (network_id, p2p_identity),
  UNIQUE (id, machine_id)
);
-- All exclusive roots (data/config/key/log/runtime) share one namespace per host.
CREATE TABLE instance_paths (
  node_id uuid NOT NULL, machine_id uuid NOT NULL, kind text NOT NULL CHECK (kind IN ('data','config','key','logs','runtime')),
  path text NOT NULL CHECK (path ~ '^/srv/bpc/[a-zA-Z0-9/_-]+$' AND path !~ '(^|/)\.\.(/|$)' AND path !~ '//|/$'),
  PRIMARY KEY (node_id, kind), UNIQUE (machine_id, path),
  FOREIGN KEY (node_id, machine_id) REFERENCES node_instances(id, machine_id)
);
-- Serialize path allocation per host; exact and nested roots must never overlap.
CREATE FUNCTION guard_instance_path() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM machines WHERE id = NEW.machine_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM instance_paths p WHERE p.machine_id = NEW.machine_id
    AND (TG_OP = 'INSERT' OR (p.node_id, p.kind) <> (NEW.node_id, NEW.kind))
    AND (p.path = NEW.path OR starts_with(p.path, NEW.path || '/') OR starts_with(NEW.path, p.path || '/'))) THEN
    RAISE EXCEPTION 'Instance path overlaps existing reservation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER paths_exclusive BEFORE INSERT OR UPDATE ON instance_paths FOR EACH ROW EXECUTE FUNCTION guard_instance_path();
CREATE TABLE instance_ports (
  node_id uuid NOT NULL, machine_id uuid NOT NULL, protocol text NOT NULL CHECK (protocol IN ('tcp','udp')),
  port integer NOT NULL CHECK (port BETWEEN 1024 AND 65535),
  purpose text NOT NULL CHECK (purpose IN ('p2p','discovery','http','metrics','ws')),
  PRIMARY KEY (machine_id, protocol, port), UNIQUE (node_id, purpose),
  FOREIGN KEY (node_id, machine_id) REFERENCES node_instances(id, machine_id)
);
CREATE TABLE operations (
  id uuid PRIMARY KEY, network_id uuid NOT NULL REFERENCES networks, author text NOT NULL,
  kind text NOT NULL CHECK (kind = 'foundation.check'),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  plan jsonb NOT NULL, plan_sha256 text NOT NULL, state text NOT NULL CHECK (state IN
    ('DRAFT','PLANNED','AWAITING_APPROVAL','QUEUED','RUNNING','VERIFYING','SUCCEEDED','FAILED','CANCELED','NEEDS_ATTENTION')),
  lease_owner uuid, lease_until timestamptz, lease_generation bigint NOT NULL DEFAULT 0,
  deadline timestamptz NOT NULL, evidence jsonb, error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (network_id, author, idempotency_key), CHECK ((lease_owner IS NULL) = (lease_until IS NULL))
);
CREATE INDEX operations_queue ON operations (created_at) WHERE state = 'QUEUED';
CREATE TABLE operation_steps (
  operation_id uuid NOT NULL REFERENCES operations, ordinal integer NOT NULL, name text NOT NULL,
  state text NOT NULL CHECK (state IN ('PENDING','RUNNING','SUCCEEDED','FAILED','NEEDS_ATTENTION')),
  evidence jsonb, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY (operation_id, ordinal)
);
CREATE TABLE resource_locks (
  resource_key text PRIMARY KEY, operation_id uuid NOT NULL REFERENCES operations,
  lease_generation bigint NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, subject text NOT NULL, action text NOT NULL,
  resource text NOT NULL, outcome text NOT NULL, correlation_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit is append only'; END $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
CREATE FUNCTION immutable_operation_plan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.plan, NEW.plan_sha256, NEW.author, NEW.network_id, NEW.kind, NEW.idempotency_key)
     IS DISTINCT FROM (OLD.plan, OLD.plan_sha256, OLD.author, OLD.network_id, OLD.kind, OLD.idempotency_key) THEN
    RAISE EXCEPTION 'Operation plan is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER operation_plan_immutable BEFORE UPDATE ON operations FOR EACH ROW EXECUTE FUNCTION immutable_operation_plan();
