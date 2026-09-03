-- Auto-derived GitHub repository metadata and admin-uploaded attachments.
-- repo_languages: JSON object of language -> bytes, from the GitHub API.
-- repo_private: whether the GitHub repository is private (hide the repo link).
-- attachments: JSON array of {name, url, kind} uploaded via /api/admin/uploads.
ALTER TABLE projects ADD COLUMN repo_languages JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE projects ADD COLUMN repo_private BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN attachments JSONB NOT NULL DEFAULT '[]'::jsonb;