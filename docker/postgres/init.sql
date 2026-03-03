-- PostgreSQL initialization script for production
-- This runs only on first container startup

-- Create database if it doesn't exist
SELECT 'CREATE DATABASE whatsapp_recovercart' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'whatsapp_recovercart')\gexec

-- Connect to the database
\c whatsapp_recovercart;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create read-only user for read replicas
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'readonly') THEN
        CREATE USER readonly WITH PASSWORD 'readonly_secure_password_change_in_production';
        GRANT CONNECT ON DATABASE whatsapp_recovercart TO readonly;
        GRANT USAGE ON SCHEMA public TO readonly;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly;
    END IF;
END $$;

-- Create analytics user for intelligence layer
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'analytics') THEN
        CREATE USER analytics WITH PASSWORD 'analytics_secure_password_change_in_production';
        GRANT CONNECT ON DATABASE whatsapp_recovercart TO analytics;
        GRANT USAGE ON SCHEMA public TO analytics;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO analytics;
    END IF;
END $$;

-- Performance optimizations
-- Adjust shared_preload_libraries in postgresql.conf:
-- shared_preload_libraries = 'pg_stat_statements'

-- Configuration recommendations (add to postgresql.conf or environment variables):
-- max_connections = 200
-- shared_buffers = 256MB
-- effective_cache_size = 1GB
-- maintenance_work_mem = 64MB
-- checkpoint_completion_target = 0.9
-- wal_buffers = 16MB
-- default_statistics_target = 100
-- random_page_cost = 1.1
-- effective_io_concurrency = 200

-- Log slow queries (add to postgresql.conf):
-- log_min_duration_statement = 1000
-- log_statement = 'all'
-- log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '

-- Create indexes for common queries (these will be created by Prisma migrations)
-- Additional performance indexes can be added here

-- Create a function to generate UUIDs (used by Prisma)
CREATE OR REPLACE FUNCTION generate_uuid() RETURNS uuid AS $$
BEGIN
    RETURN uuid_generate_v4();
END;
$$ LANGUAGE plpgsql;

-- Create a function for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Performance monitoring view
CREATE OR REPLACE VIEW performance_stats AS
SELECT 
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation,
    most_common_vals,
    most_common_freqs
FROM pg_stats 
WHERE schemaname = 'public'
ORDER BY tablename, attname;

-- Database health check function
CREATE OR REPLACE FUNCTION health_check() 
RETURNS TABLE(status text, details json) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        'healthy'::text as status,
        json_build_object(
            'timestamp', now(),
            'database_size', pg_size_pretty(pg_database_size(current_database())),
            'active_connections', (SELECT count(*) FROM pg_stat_activity WHERE state = 'active'),
            'total_connections', (SELECT count(*) FROM pg_stat_activity),
            'version', version()
        ) as details;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions for health check
GRANT EXECUTE ON FUNCTION health_check() TO PUBLIC;

COMMENT ON DATABASE whatsapp_recovercart IS 'WhatsApp RecoverCart Shopify App Database - Production';