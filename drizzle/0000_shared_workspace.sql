CREATE TABLE shared_workspace (id TEXT PRIMARY KEY NOT NULL, generation INTEGER NOT NULL, data TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE web_sessions (token_hash TEXT PRIMARY KEY NOT NULL, core_id TEXT NOT NULL, csrf TEXT NOT NULL, created_at INTEGER NOT NULL, last_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE login_limits (key TEXT PRIMARY KEY NOT NULL, started_at INTEGER NOT NULL, attempts INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE edge_audit (id TEXT PRIMARY KEY NOT NULL, actor_id TEXT, action TEXT NOT NULL, created_at TEXT NOT NULL);
