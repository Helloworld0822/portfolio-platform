CREATE INDEX projects_repo_url_idx ON projects (url) WHERE url IS NOT NULL;
