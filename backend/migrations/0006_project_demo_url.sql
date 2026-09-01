-- Add a demo/deployed URL to each project, separate from its GitHub repo URL.
-- Existing rows keep their `url` (GitHub) and get no demo link unless filled in
-- via the admin editor.
ALTER TABLE projects ADD COLUMN demo_url TEXT;