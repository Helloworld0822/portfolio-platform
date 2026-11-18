ALTER TABLE timeline_entries
    ADD COLUMN attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
