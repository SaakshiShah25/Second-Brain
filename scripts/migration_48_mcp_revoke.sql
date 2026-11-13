-- scripts/migration_48_mcp_revoke.sql - "Disconnect Claude" (schema.sql section 48).
-- Paste into Supabase > SQL Editor > Run. Safe to run more than once.

-- 48. When a person last disconnected Claude from their account. Every Claude sign-in token issued BEFORE this moment
--     stops working at once (api/routers/mcp.py checks it), so "Disconnect" in Settings really cuts access instead of
--     waiting for the tokens to expire. Null = never disconnected.
alter table user_preference add column if not exists mcp_revoked_at timestamptz;
notify pgrst, 'reload schema';
