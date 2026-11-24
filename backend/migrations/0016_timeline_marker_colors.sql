ALTER TABLE timeline_entries
    ADD COLUMN marker_color TEXT NOT NULL DEFAULT 'default'
    CHECK (marker_color IN ('default', 'gold', 'silver', 'bronze'));
