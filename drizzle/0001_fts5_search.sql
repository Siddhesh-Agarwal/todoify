-- Full-text search over task title + description (DESIGN.md §4.3).
-- Self-contained FTS5 table; rowid mirrors the task table's implicit rowid so
-- sync triggers can delete/update by rowid (the universally supported path).
-- Not Drizzle-modeled (AGENTS.md); hand-written, applied via wrangler.
CREATE VIRTUAL TABLE task_fts USING fts5(
  title,
  description
);

CREATE TRIGGER task_ai AFTER INSERT ON task BEGIN
  INSERT INTO task_fts (rowid, title, description)
  VALUES (new.rowid, new.title, COALESCE(new.description, ''));
END;

CREATE TRIGGER task_ad AFTER DELETE ON task BEGIN
  DELETE FROM task_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER task_au AFTER UPDATE ON task BEGIN
  DELETE FROM task_fts WHERE rowid = old.rowid;
  INSERT INTO task_fts (rowid, title, description)
  VALUES (new.rowid, new.title, COALESCE(new.description, ''));
END;
