import BetterSqlite3 from "better-sqlite3";
import type { Logger } from "../common/logger.js";

type Migration = (db: BetterSqlite3.Database) => void;

const migrations: Record<number, Migration> = {
  1: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS recurrence_templates (
        id TEXT PRIMARY KEY,
        task_data TEXT NOT NULL,
        rrule TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        duration INTEGER NOT NULL,
        deadline TEXT,
        priority TEXT NOT NULL DEFAULT 'P3',
        status TEXT NOT NULL DEFAULT 'pending',
        category TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        is_recurring INTEGER NOT NULL DEFAULT 0,
        recurrence_template_id TEXT,
        actual_duration INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (recurrence_template_id) REFERENCES recurrence_templates(id)
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
      CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
      CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
      CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_template ON tasks(recurrence_template_id);

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        start_time TEXT,
        end_time TEXT,
        is_all_day INTEGER NOT NULL DEFAULT 0,
        date TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_time);
      CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

      CREATE TABLE IF NOT EXISTS time_blocks (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        date TEXT NOT NULL,
        block_index INTEGER NOT NULL DEFAULT 0,
        total_blocks INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );

      CREATE INDEX IF NOT EXISTS idx_time_blocks_task ON time_blocks(task_id);
      CREATE INDEX IF NOT EXISTS idx_time_blocks_date ON time_blocks(date);
      CREATE INDEX IF NOT EXISTS idx_time_blocks_start ON time_blocks(start_time);

      CREATE TABLE IF NOT EXISTS dependencies (
        task_id TEXT NOT NULL,
        depends_on_id TEXT NOT NULL,
        PRIMARY KEY (task_id, depends_on_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id),
        FOREIGN KEY (depends_on_id) REFERENCES tasks(id)
      );

      CREATE TABLE IF NOT EXISTS schedule_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        status TEXT NOT NULL DEFAULT 'up_to_date',
        last_replan_at TEXT
      );

      CREATE TABLE IF NOT EXISTS config_availability (
        day INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        PRIMARY KEY (day, start_time)
      );

      CREATE TABLE IF NOT EXISTS config_focus_time (
        day INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        PRIMARY KEY (day, start_time)
      );

      CREATE TABLE IF NOT EXISTS config_preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recurrence_instances (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        scheduled_date TEXT NOT NULL,
        is_exception INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (template_id) REFERENCES recurrence_templates(id),
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );

      CREATE INDEX IF NOT EXISTS idx_recurrence_instances_template ON recurrence_instances(template_id);
      CREATE INDEX IF NOT EXISTS idx_recurrence_instances_date ON recurrence_instances(scheduled_date);

      CREATE TABLE IF NOT EXISTS recurrence_exceptions (
        template_id TEXT NOT NULL,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        overrides TEXT,
        PRIMARY KEY (template_id, date),
        FOREIGN KEY (template_id) REFERENCES recurrence_templates(id)
      );

      INSERT OR IGNORE INTO schedule_status (id, status, last_replan_at) VALUES (1, 'up_to_date', NULL);

      INSERT OR IGNORE INTO config_preferences (key, value) VALUES
        ('buffer_time_minutes', '15'),
        ('default_priority', '"P3"'),
        ('default_duration', '60'),
        ('scheduling_horizon_weeks', '4'),
        ('minimum_block_minutes', '30'),
        ('focus_time_minimum_block_minutes', '60');
    `);
  },

  // Future migrations go here:
  // 2: (db) => { db.exec("ALTER TABLE tasks ADD COLUMN notes TEXT"); },
};

export const LATEST_VERSION = Math.max(...Object.keys(migrations).map(Number));

function runMigrations(db: Database): void {
  const currentVersion = (db.pragma("user_version") as { user_version: number }[])[0].user_version;

  if (currentVersion >= LATEST_VERSION) {
    return;
  }

  for (let version = currentVersion + 1; version <= LATEST_VERSION; version++) {
    const migration = migrations[version];
    if (!migration) {
      throw new Error(`Missing migration for version ${version}`);
    }

    db.transaction(() => {
      migration(db);
      db.pragma(`user_version = ${version}`);
    })();
    db.logger.info("database", `applied migration ${version}`);
  }
}

export class Database extends BetterSqlite3 {
  readonly logger: Logger;

  constructor(filename: string, logger: Logger) {
    super(filename);
    this.logger = logger;
    this.pragma("journal_mode = WAL");
    this.pragma("foreign_keys = ON");
    this.logger.debug("database", `opened ${filename}`);
    runMigrations(this);
  }
}
