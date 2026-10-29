DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='bpc_api') THEN CREATE ROLE bpc_api NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='bpc_worker') THEN CREATE ROLE bpc_worker NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO bpc_api,bpc_worker;
GRANT SELECT ON networks,machines,node_instances,instance_paths,instance_ports,operations TO bpc_api;
GRANT INSERT ON operations,operation_steps,audit_events TO bpc_api;
GRANT SELECT ON networks,node_instances,operations,operation_steps,resource_locks TO bpc_worker;
GRANT UPDATE ON operations,operation_steps TO bpc_worker;
GRANT INSERT,DELETE ON resource_locks TO bpc_worker;
GRANT INSERT ON audit_events TO bpc_worker;
GRANT USAGE ON SEQUENCE audit_events_id_seq TO bpc_api,bpc_worker;
