// Generated from packages/chat-naming/core/registry.ts by hosts/claude/directory/build.py.
// Types were stripped; the logic is unchanged. Edit the TypeScript source, not this file.
import { Database, sleepSync } from "../sqlite.mjs";
import { chmodSync, closeSync, constants as fsc, lstatSync, mkdirSync, openSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { NamingError, fail } from "./errors.mjs";
export const DB_FILE = "chat-naming.sqlite3";
export const SCHEMA_VERSION = 2;
export const DEFAULT_BUSY_TIMEOUT_MS = 15_000;
const PENDING = "('planned','reserved','applying','applied_unverified')";
const MIGRATIONS = [
    [
        `CREATE TABLE chains (
      chain_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      host TEXT NOT NULL,
      topic TEXT NOT NULL,
      locale TEXT NOT NULL CHECK (locale IN ('ru','en')),
      origin TEXT NOT NULL CHECK (origin IN ('new','branch','imported')),
      parent_chain_id TEXT REFERENCES chains(chain_id),
      parent_chat_id TEXT,
      phase_floor INTEGER NOT NULL DEFAULT 0 CHECK (phase_floor >= 0),
      history_complete INTEGER NOT NULL DEFAULT 1 CHECK (history_complete IN (0,1)),
      created_at TEXT NOT NULL
    )`,
        `CREATE INDEX chains_by_topic ON chains(project_id, host, topic)`,
        `CREATE TABLE chats (
      host TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      chain_id TEXT REFERENCES chains(chain_id),
      parent_chat_id TEXT,
      relation TEXT NOT NULL CHECK (relation IN ('new','continue','branch','subtask','imported','observed')),
      phase INTEGER CHECK (phase IS NULL OR phase >= 1),
      focus TEXT,
      ownership TEXT NOT NULL CHECK (ownership IN ('capturable','ours','adopted','auto','manual','unknown')),
      observed_title TEXT,
      observed_revision TEXT,
      last_written_title TEXT,
      last_written_revision TEXT,
      last_write_operation TEXT,
      frozen INTEGER NOT NULL DEFAULT 0 CHECK (frozen IN (0,1)),
      frozen_reason TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (host, chat_id)
    )`,
        `CREATE TABLE phases (
      chain_id TEXT NOT NULL REFERENCES chains(chain_id),
      phase INTEGER NOT NULL CHECK (phase >= 1),
      host TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('reserved','imported','history')),
      created_at TEXT NOT NULL,
      PRIMARY KEY (chain_id, phase)
    )`,
        `CREATE TABLE operations (
      operation_id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      host TEXT NOT NULL,
      event_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('name','history','undo')),
      project_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      chain_id TEXT,
      phase INTEGER,
      focus TEXT,
      state TEXT NOT NULL CHECK (state IN ('planned','reserved','applying','applied_unverified','verified','conflict','failed','skipped')),
      reason TEXT,
      previous_title TEXT,
      previous_revision TEXT,
      desired_title TEXT,
      readback_title TEXT,
      readback_revision TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (host, event_id)
    )`,
        `CREATE UNIQUE INDEX operations_one_pending_per_chat ON operations(host, chat_id) WHERE state IN ${PENDING}`,
        `CREATE TABLE transitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_id TEXT NOT NULL REFERENCES operations(operation_id),
      from_state TEXT,
      to_state TEXT NOT NULL,
      detail TEXT,
      at TEXT NOT NULL
    )`,
        `CREATE TABLE handoffs (
      nonce TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      host TEXT NOT NULL,
      chain_id TEXT NOT NULL REFERENCES chains(chain_id),
      parent_chat_id TEXT NOT NULL,
      relation TEXT NOT NULL CHECK (relation IN ('continue','branch','subtask')),
      created_at TEXT NOT NULL,
      consumed_by_chat_id TEXT,
      consumed_at TEXT
    )`
    ],
    [
        `ALTER TABLE chains ADD COLUMN history_ambiguous INTEGER NOT NULL DEFAULT 0 CHECK (history_ambiguous IN (0,1))`,
        `CREATE TABLE confirmed_members (
      chain_id TEXT NOT NULL REFERENCES chains(chain_id),
      host TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (chain_id, host, chat_id)
    )`
    ]
];
function lstatOrNull(path) {
    try {
        return lstatSync(path);
    } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
    }
}
function uid() {
    return typeof process.getuid === "function" ? process.getuid() : -1;
}
function assertOwned(stat, path, kind) {
    if (stat.isSymbolicLink()) fail("UNSAFE_STATE_PATH", `${kind} must not be a symlink`, {
        path
    });
    if (kind === "directory" ? !stat.isDirectory() : !stat.isFile()) {
        fail("UNSAFE_STATE_PATH", `expected a ${kind}`, {
            path
        });
    }
    if (uid() >= 0 && stat.uid !== uid()) fail("UNSAFE_STATE_PATH", `${kind} is not owned by the current user`, {
        path
    });
    if (kind === "file" && stat.nlink > 1) fail("UNSAFE_STATE_PATH", "registry file has extra hard links", {
        path
    });
}
const trustedOwner = (stat)=>uid() < 0 || stat.uid === 0 || stat.uid === uid();
function assertSafeAncestors(dir) {
    if (uid() < 0) return;
    let nearestExisting = null;
    for(let p = dirname(dir);; p = dirname(p)){
        const st = lstatOrNull(p);
        if (st) {
            if (st.isSymbolicLink() && !trustedOwner(st)) fail("UNSAFE_STATE_PATH", "ancestor symlink owned by another user", {
                path: p
            });
            nearestExisting ??= p;
        }
        if (dirname(p) === p) break;
    }
    if (!nearestExisting) return;
    for(let p = realpathSync(nearestExisting);; p = dirname(p)){
        const st = lstatSync(p);
        if (!st.isDirectory()) fail("UNSAFE_STATE_PATH", "ancestor is not a directory", {
            path: p
        });
        if (!trustedOwner(st)) fail("UNSAFE_STATE_PATH", "ancestor directory owned by another user", {
            path: p
        });
        if ((st.mode & 0o022) !== 0 && (st.mode & 0o1000) === 0) {
            fail("UNSAFE_STATE_PATH", "ancestor directory is writable by group/others without the sticky bit", {
                path: p
            });
        }
        if (dirname(p) === p) break;
    }
}
function prepareFiles(rawStateDir, readOnly) {
    if (typeof rawStateDir !== "string" || !isAbsolute(rawStateDir)) {
        fail("UNSAFE_STATE_PATH", "--state-dir must be an absolute path", {
            stateDir: rawStateDir
        });
    }
    const stateDir = resolve(rawStateDir);
    if (stateDir === sep) fail("UNSAFE_STATE_PATH", "--state-dir must not be the filesystem root");
    assertSafeAncestors(stateDir);
    let dir = lstatOrNull(stateDir);
    if (!dir) {
        if (readOnly) return null;
        mkdirSync(stateDir, {
            recursive: true,
            mode: 0o700
        });
        dir = lstatSync(stateDir);
    }
    assertOwned(dir, stateDir, "directory");
    if ((dir.mode & 0o077) !== 0) {
        if (readOnly) fail("UNSAFE_STATE_PATH", "state directory is accessible by other users", {
            path: stateDir
        });
        chmodSync(stateDir, 0o700);
    }
    const dbPath = join(stateDir, DB_FILE);
    for (const suffix of [
        "-wal",
        "-shm",
        "-journal"
    ]){
        const sidePath = dbPath + suffix;
        const side = lstatOrNull(sidePath);
        if (!side) continue;
        assertOwned(side, sidePath, "file");
        if ((side.mode & 0o077) !== 0) {
            if (readOnly) fail("UNSAFE_STATE_PATH", "registry side file is accessible by other users", {
                path: sidePath
            });
            chmodSync(sidePath, 0o600);
        }
    }
    let file = lstatOrNull(dbPath);
    if (!file) {
        if (readOnly) return null;
        try {
            const fd = openSync(dbPath, fsc.O_CREAT | fsc.O_EXCL | fsc.O_WRONLY | fsc.O_NOFOLLOW, 0o600);
            closeSync(fd);
        } catch (error) {
            if (error.code !== "EEXIST") throw error;
        }
        file = lstatSync(dbPath);
    }
    assertOwned(file, dbPath, "file");
    if ((file.mode & 0o077) !== 0) {
        if (readOnly) fail("UNSAFE_STATE_PATH", "registry file is accessible by other users", {
            path: dbPath
        });
        chmodSync(dbPath, 0o600);
    }
    return dbPath;
}
export function isBusy(error) {
    const e = error;
    return typeof e?.code === "string" && e.code.startsWith("SQLITE_BUSY") || typeof e?.message === "string" && /database is locked|SQLITE_BUSY/i.test(e.message);
}
function withBusyRetry(timeoutMs, fn) {
    const deadline = Date.now() + timeoutMs;
    for(;;){
        try {
            return fn();
        } catch (error) {
            if (!isBusy(error)) throw error;
            if (Date.now() > deadline) {
                throw new NamingError("REGISTRY_BUSY", "registry stayed locked past the busy timeout; retry later", {
                    timeoutMs
                });
            }
            sleepSync(5 + Math.floor(Math.random() * 20));
        }
    }
}
function migrate(db, timeoutMs) {
    const current = db.query("PRAGMA user_version").get().user_version;
    if (current > SCHEMA_VERSION) {
        fail("REGISTRY_TOO_NEW", `registry schema v${current} is newer than this core (v${SCHEMA_VERSION})`);
    }
    if (current === SCHEMA_VERSION) return;
    immediate({
        db,
        path: "",
        readOnly: false,
        busyTimeoutMs: timeoutMs
    }, ()=>{
        const inside = db.query("PRAGMA user_version").get().user_version;
        for(let v = inside; v < SCHEMA_VERSION; v++){
            for (const sql of MIGRATIONS[v])db.run(sql);
        }
        db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    });
}
export function openRegistry(stateDir, options = {}) {
    const readOnly = options.readOnly ?? false;
    const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
    const path = prepareFiles(stateDir, readOnly);
    if (path === null) return null;
    const before = lstatSync(path);
    const db = readOnly ? new Database(path, {
        readonly: true,
        strict: true
    }) : new Database(path, {
        readwrite: true,
        create: false,
        strict: true
    });
    try {
        const after = lstatSync(path);
        if (after.isSymbolicLink() || after.ino !== before.ino || after.dev !== before.dev) {
            fail("UNSAFE_STATE_PATH", "registry file changed while opening", {
                path
            });
        }
        db.run(`PRAGMA busy_timeout = ${Math.max(0, Math.floor(busyTimeoutMs))}`);
        withBusyRetry(busyTimeoutMs, ()=>{
            const mode = db.query("PRAGMA journal_mode").get().journal_mode;
            if (mode.toLowerCase() !== "wal") {
                if (readOnly) return;
                const set = db.query("PRAGMA journal_mode = WAL").get().journal_mode;
                if (set.toLowerCase() !== "wal") fail("INTERNAL", `could not enable WAL (got ${set})`);
            }
        });
        db.run("PRAGMA foreign_keys = ON");
        db.run("PRAGMA synchronous = FULL");
        if (readOnly) {
            const version = db.query("PRAGMA user_version").get().user_version;
            if (version > SCHEMA_VERSION) fail("REGISTRY_TOO_NEW", `registry schema v${version} is newer than this core`);
            db.run("PRAGMA query_only = ON");
            if (version === 0) {
                db.close();
                return null;
            }
            if (version < SCHEMA_VERSION) {
                fail("REGISTRY_NEEDS_MIGRATION", `registry schema v${version} must be migrated by a write command first`, {
                    version,
                    current: SCHEMA_VERSION
                });
            }
        } else {
            withBusyRetry(busyTimeoutMs, ()=>migrate(db, busyTimeoutMs));
        }
        return {
            db,
            path,
            readOnly,
            busyTimeoutMs
        };
    } catch (error) {
        db.close();
        throw error;
    }
}
export function immediate(reg, fn) {
    if (reg.readOnly) fail("INTERNAL", "write attempted on a read-only registry handle");
    withBusyRetry(reg.busyTimeoutMs, ()=>reg.db.run("BEGIN IMMEDIATE"));
    let result;
    try {
        result = fn();
    } catch (error) {
        try {
            reg.db.run("ROLLBACK");
        } catch  {}
        throw error;
    }
    try {
        withBusyRetry(reg.busyTimeoutMs, ()=>reg.db.run("COMMIT"));
    } catch (error) {
        try {
            reg.db.run("ROLLBACK");
        } catch  {}
        throw error;
    }
    return result;
}
