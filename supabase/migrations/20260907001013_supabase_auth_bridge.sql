-- Private schema: existing grants and RLS remain unchanged. No auth.users writes.
ALTER TABLE presenca.users ADD COLUMN supabase_user_id text;
ALTER TABLE presenca.users ADD COLUMN email_verified_at timestamptz;
CREATE UNIQUE INDEX users_supabase_user_id ON presenca.users(supabase_user_id) WHERE supabase_user_id IS NOT NULL;
ALTER TABLE presenca.password_resets ADD COLUMN auth_session text;
