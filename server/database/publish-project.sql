USE writeflow_db;

ALTER TABLE projects
  ADD COLUMN category VARCHAR(80) NULL AFTER cover_path,
  ADD COLUMN tags JSON NULL AFTER category,
  ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT FALSE AFTER tags,
  ADD COLUMN allow_comments BOOLEAN NOT NULL DEFAULT TRUE AFTER is_published,
  ADD COLUMN published_at TIMESTAMP(3) NULL AFTER allow_comments;

UPDATE projects SET tags = JSON_ARRAY() WHERE tags IS NULL;
ALTER TABLE projects MODIFY COLUMN tags JSON NOT NULL;

CREATE TABLE project_likes (
  project_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (project_id, user_id),
  CONSTRAINT fk_project_likes_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_likes_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE project_bookmarks (
  project_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (project_id, user_id),
  CONSTRAINT fk_project_bookmarks_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_bookmarks_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE project_comments (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  content VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_project_comments_project
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_comments_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_project_comments_project_created (project_id, created_at)
);
