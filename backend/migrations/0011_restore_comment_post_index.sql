CREATE INDEX IF NOT EXISTS comments_post_id_created_at_idx ON comments(post_id, created_at);
