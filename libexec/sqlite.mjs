// The subset of bun:sqlite that the naming core uses, implemented on node:sqlite.
// The core calls only: new Database(path, options), db.run(sql, ...params),
// db.query(sql).get/all/run(...params) with positional parameters, db.close().

import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

class Statement {
  constructor(db, sql) {
    this.statement = db.prepare(sql)
  }

  // bun:sqlite returns null when no row matches; node:sqlite returns undefined.
  get(...params) {
    const row = this.statement.get(...params)
    return row === undefined ? null : row
  }

  all(...params) {
    return this.statement.all(...params)
  }

  run(...params) {
    return this.statement.run(...params)
  }
}

export class Database {
  constructor(path, options = {}) {
    const readOnly = options.readonly === true
    // bun:sqlite refuses to create a missing file when create is false; node:sqlite would create it.
    if (!readOnly && options.create === false && !existsSync(path)) {
      const error = new Error('unable to open database file: ' + path)
      error.code = 'SQLITE_CANTOPEN'
      throw error
    }
    this.db = new DatabaseSync(path, { readOnly })
  }

  query(sql) {
    return new Statement(this.db, sql)
  }

  run(sql, ...params) {
    if (params.length === 0) {
      this.db.exec(sql)
      return { changes: 0, lastInsertRowid: 0 }
    }
    return this.db.prepare(sql).run(...params)
  }

  // bun:sqlite tolerates a second close; node:sqlite throws, so close only once.
  close() {
    if (!this.db.isOpen) return
    this.db.close()
  }
}

// Replaces Bun.sleepSync for the core's short busy-retry back-off.
export function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(0, ms))
}
