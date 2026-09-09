-- Posts move from UUID ids + a derived slug to sequential integer ids
-- starting at 1 (public URLs become /blog/{id} instead of /blog/{slug}).
-- Existing rows are renumbered in created_at order so the oldest post
-- becomes id 1.

ALTER TABLE comments DROP CONSTRAINT comments_post_id_fkey;

ALTER TABLE posts ADD COLUMN new_id BIGINT;
WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn FROM posts
)
UPDATE posts SET new_id = ordered.rn FROM ordered WHERE posts.id = ordered.id;

ALTER TABLE comments ADD COLUMN new_post_id BIGINT;
UPDATE comments SET new_post_id = posts.new_id FROM posts WHERE comments.post_id = posts.id;

ALTER TABLE posts DROP CONSTRAINT posts_pkey;
ALTER TABLE posts DROP COLUMN id;
ALTER TABLE posts RENAME COLUMN new_id TO id;
ALTER TABLE posts ALTER COLUMN id SET NOT NULL;
ALTER TABLE posts ADD PRIMARY KEY (id);

CREATE SEQUENCE posts_id_seq OWNED BY posts.id;
SELECT setval(
    'posts_id_seq',
    GREATEST((SELECT COALESCE(MAX(id), 0) FROM posts), 1),
    (SELECT MAX(id) FROM posts) IS NOT NULL
);
ALTER TABLE posts ALTER COLUMN id SET DEFAULT nextval('posts_id_seq');

ALTER TABLE posts DROP COLUMN slug;

ALTER TABLE comments DROP COLUMN post_id;
ALTER TABLE comments RENAME COLUMN new_post_id TO post_id;
ALTER TABLE comments ALTER COLUMN post_id SET NOT NULL;
ALTER TABLE comments ADD CONSTRAINT comments_post_id_fkey
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
