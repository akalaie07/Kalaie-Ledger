-- Online-Status: last_seen_at in profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now();

-- Nachrichten-Tabelle
CREATE TABLE IF NOT EXISTS messages (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid    REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  sender_id   uuid        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content     text        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read org messages" ON messages
  FOR SELECT USING (organization_id = auth_org_id());

CREATE POLICY "members can send messages" ON messages
  FOR INSERT WITH CHECK (
    organization_id = auth_org_id()
    AND sender_id = auth.uid()
  );

-- Realtime für messages aktivieren
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Update last_seen_at: eigenes Profil
CREATE POLICY "users can update own last_seen_at" ON profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
