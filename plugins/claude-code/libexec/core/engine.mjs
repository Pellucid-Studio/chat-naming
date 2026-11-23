// Generated from packages/chat-naming/core/engine.ts by hosts/claude/directory/build.py.
// Types were stripped; the logic is unchanged. Edit the TypeScript source, not this file.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { NamingError, fail } from "./errors.mjs";
import { immediate, openRegistry } from "./registry.mjs";
import { MAX_MAX_LENGTH, MAX_PHASE, MIN_MAX_LENGTH, cleanTopic, layoutTitle, normalizeText, parseTitle } from "./title.mjs";
import { Fields, HOSTS, parseMetadata, parseSnapshot, stableJson } from "./validate.mjs";
const PENDING_STATES = [
    "planned",
    "reserved",
    "applying",
    "applied_unverified"
];
const FROZEN_BEFORE_APPLY = "frozen-before-apply";
const RELATIONS = [
    "new",
    "continue",
    "branch",
    "subtask"
];
export const MAX_HISTORY_IMPORT_ITEMS = 1000;
export const MAX_HISTORY_APPLY_ITEMS = 200;
export const HANDOFF_KIND = "chat-naming-handoff";
function nextFor(state, frozen = false) {
    if (state === "planned" || state === "reserved") return frozen ? "none" : "apply";
    if (state === "applying" || state === "applied_unverified") return "confirm";
    return "none";
}
function opView(op, extra = {}) {
    const view = {
        operationId: op.operation_id,
        eventId: op.event_id,
        kind: op.kind,
        state: op.state,
        reason: op.reason,
        projectId: op.project_id,
        host: op.host,
        chatId: op.chat_id,
        chainId: op.chain_id,
        phase: op.phase,
        previousTitle: op.previous_title,
        previousRevision: op.previous_revision,
        desiredTitle: op.desired_title,
        readbackTitle: op.readback_title,
        next: nextFor(op.state, extra.frozen)
    };
    if (extra.token) view.token = op.token;
    if (extra.replayed !== undefined) view.replayed = extra.replayed;
    return view;
}
function chatView(c) {
    return {
        projectId: c.project_id,
        host: c.host,
        chatId: c.chat_id,
        chainId: c.chain_id,
        parentChatId: c.parent_chat_id,
        relation: c.relation,
        phase: c.phase,
        focus: c.focus,
        ownership: c.ownership,
        frozen: c.frozen === 1,
        frozenReason: c.frozen_reason,
        observedTitle: c.observed_title,
        lastWrittenTitle: c.last_written_title,
        lastWrittenRevision: c.last_written_revision,
        metadata: JSON.parse(c.metadata),
        createdAt: c.created_at,
        updatedAt: c.updated_at
    };
}
const revisionOk = (expected, actual)=>expected === null || expected === actual;
const sameObservation = (title, revision, snap)=>snap.title === title && revisionOk(revision, snap.revision);
const ownershipFromOrigin = (origin)=>origin === "manual" ? "manual" : origin === "auto" || origin === "ours" ? "auto" : "unknown";
const nonHumanOrigin = (origin)=>origin === "auto" || origin === "ours";
function fingerprint(value) {
    return createHash("sha256").update(stableJson(value)).digest("hex");
}
function tokensEqual(a, b) {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
}
function parseScope(f) {
    return {
        projectId: f.reqId("projectId"),
        host: f.oneOf("host", HOSTS),
        chatId: f.reqId("chatId")
    };
}
function parseTitleOptions(f) {
    const o = {
        optional: true,
        nullable: true
    };
    return {
        locale: f.oneOf("locale", [
            "ru",
            "en"
        ], o),
        maxLength: f.int("maxLength", MIN_MAX_LENGTH, MAX_MAX_LENGTH, o),
        measure: f.oneOf("measure", [
            "graphemes",
            "display-width"
        ], o)
    };
}
function parseHandoff(value) {
    const f = Fields.of(value, "handoff", [
        "protocolVersion",
        "kind",
        "projectId",
        "host",
        "chainId",
        "parentChatId",
        "relation",
        "nonce",
        "topic",
        "createdAt"
    ]);
    f.int("protocolVersion", 1, 1);
    if (f.raw("kind") !== HANDOFF_KIND) fail("INVALID_REQUEST", `handoff.kind must be "${HANDOFF_KIND}"`);
    const topic = f.str("topic", {
        optional: true,
        nullable: true
    });
    f.str("createdAt", {
        optional: true,
        nullable: true,
        max: 64
    });
    const doc = {
        protocolVersion: 1,
        kind: HANDOFF_KIND,
        projectId: f.reqId("projectId"),
        host: f.oneOf("host", HOSTS),
        chainId: f.uuid("chainId"),
        parentChatId: f.reqId("parentChatId"),
        relation: f.oneOf("relation", [
            "continue",
            "branch",
            "subtask"
        ]),
        nonce: f.uuid("nonce")
    };
    if (topic !== null) doc.topic = topic;
    return doc;
}
function parseBegin(input) {
    const f = Fields.of(input, "request", [
        "eventId",
        "projectId",
        "host",
        "chatId",
        "relation",
        "parentChatId",
        "handoff",
        "topic",
        "focus",
        "requireFullFocus",
        "locale",
        "maxLength",
        "measure",
        "metadata",
        "snapshot"
    ]);
    const o = {
        optional: true,
        nullable: true
    };
    const handoffRaw = f.raw("handoff");
    return {
        eventId: f.reqId("eventId"),
        ...parseScope(f),
        ...parseTitleOptions(f),
        relation: f.oneOf("relation", RELATIONS, o),
        parentChatId: f.id("parentChatId", o),
        handoff: handoffRaw == null ? null : parseHandoff(handoffRaw),
        topic: f.str("topic", o),
        focus: f.str("focus", {
            ...o,
            allowEmpty: true
        }),
        requireFullFocus: f.bool("requireFullFocus", false),
        metadata: parseMetadata(f.raw("metadata"), "metadata"),
        snapshot: parseSnapshot(f.raw("snapshot"), "snapshot")
    };
}
function parseOpRef(input, extra) {
    const f = Fields.of(input, "request", [
        "operationId",
        "token",
        ...extra
    ]);
    return {
        f,
        operationId: f.reqId("operationId"),
        token: f.reqId("token")
    };
}
function parseHistoryItems(f, max) {
    const raw = f.array("items", max);
    const seen = new Set();
    return raw.map((value, i)=>{
        const item = Fields.of(value, `items[${i}]`, [
            "chatId",
            "snapshot",
            "proposal"
        ]);
        const chatId = item.reqId("chatId");
        if (seen.has(chatId)) fail("INVALID_REQUEST", `duplicate chatId in items: ${chatId}`);
        seen.add(chatId);
        const p = Fields.of(item.raw("proposal"), `items[${i}].proposal`, [
            "topic",
            "phase",
            "focus"
        ]);
        return {
            chatId,
            snapshot: parseSnapshot(item.raw("snapshot"), `items[${i}].snapshot`),
            topic: p.reqStr("topic"),
            phase: p.int("phase", 1, MAX_PHASE, {
                optional: true,
                nullable: true
            }),
            focus: p.str("focus", {
                optional: true,
                nullable: true,
                allowEmpty: true
            })
        };
    });
}
export class NamingEngine {
    reg;
    readOnly;
    clock;
    constructor(reg, readOnly, clock){
        this.reg = reg;
        this.readOnly = readOnly;
        this.clock = clock;
    }
    static open(options) {
        const readOnly = options.readOnly ?? false;
        const reg = openRegistry(options.stateDir, {
            readOnly,
            busyTimeoutMs: options.busyTimeoutMs
        });
        return new NamingEngine(reg, readOnly, options.clock ?? (()=>new Date()));
    }
    close() {
        this.reg?.db.close();
    }
    get db() {
        return this.reg?.db ?? null;
    }
    tx(fn) {
        if (this.readOnly || !this.reg) fail("INTERNAL", "this engine was opened read-only");
        return immediate(this.reg, fn);
    }
    now() {
        return this.clock().toISOString();
    }
    one(sql, ...params) {
        if (!this.db) return null;
        return this.db.query(sql).get(...params) ?? null;
    }
    all(sql, ...params) {
        if (!this.db) return [];
        return this.db.query(sql).all(...params);
    }
    run(sql, ...params) {
        this.db.query(sql).run(...params);
    }
    getChat(host, chatId) {
        return this.one("SELECT * FROM chats WHERE host = ? AND chat_id = ?", host, chatId);
    }
    getChain(chainId) {
        return this.one("SELECT * FROM chains WHERE chain_id = ?", chainId);
    }
    getOp(operationId) {
        return this.one("SELECT * FROM operations WHERE operation_id = ?", operationId);
    }
    getOpByEvent(host, eventId) {
        return this.one("SELECT * FROM operations WHERE host = ? AND event_id = ?", host, eventId);
    }
    getPendingOp(host, chatId) {
        return this.one(`SELECT * FROM operations WHERE host = ? AND chat_id = ? AND state IN ('planned','reserved','applying','applied_unverified')`, host, chatId);
    }
    chainsByTopic(projectId, host, topic) {
        return this.all("SELECT * FROM chains WHERE project_id = ? AND host = ? AND topic = ? ORDER BY created_at, chain_id", projectId, host, topic);
    }
    maxReserved(chainId) {
        return this.one("SELECT COALESCE(MAX(phase), 0) AS m FROM phases WHERE chain_id = ?", chainId)?.m ?? 0;
    }
    nextPhase(chain) {
        const next = Math.max(this.maxReserved(chain.chain_id), chain.phase_floor) + 1;
        if (next > MAX_PHASE) fail("INVALID_REQUEST", "chain phase counter exhausted", {
            chainId: chain.chain_id
        });
        return next;
    }
    chainView(c) {
        const max = this.maxReserved(c.chain_id);
        return {
            chainId: c.chain_id,
            projectId: c.project_id,
            host: c.host,
            topic: c.topic,
            locale: c.locale,
            origin: c.origin,
            parentChainId: c.parent_chain_id,
            parentChatId: c.parent_chat_id,
            phaseFloor: c.phase_floor,
            historyComplete: c.history_complete === 1,
            historyAmbiguous: c.history_ambiguous === 1,
            maxReservedPhase: max,
            nextPhase: Math.max(max, c.phase_floor) + 1
        };
    }
    insertChain(c) {
        const row = {
            ...c,
            created_at: this.now()
        };
        this.run(`INSERT INTO chains (chain_id, project_id, host, topic, locale, origin, parent_chain_id, parent_chat_id,
        phase_floor, history_complete, history_ambiguous, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, row.chain_id, row.project_id, row.host, row.topic, row.locale, row.origin, row.parent_chain_id, row.parent_chat_id, row.phase_floor, row.history_complete, row.history_ambiguous, row.created_at);
        return row;
    }
    upsertChat(c, exists) {
        const values = [
            c.project_id,
            c.chain_id,
            c.parent_chat_id,
            c.relation,
            c.phase,
            c.focus,
            c.ownership,
            c.observed_title,
            c.observed_revision,
            c.last_written_title,
            c.last_written_revision,
            c.last_write_operation,
            c.frozen,
            c.frozen_reason,
            c.metadata,
            c.created_at,
            c.updated_at
        ];
        if (exists) {
            this.run(`UPDATE chats SET project_id=?, chain_id=?, parent_chat_id=?, relation=?, phase=?, focus=?, ownership=?,
          observed_title=?, observed_revision=?, last_written_title=?, last_written_revision=?,
          last_write_operation=?, frozen=?, frozen_reason=?, metadata=?, created_at=?, updated_at=?
          WHERE host=? AND chat_id=?`, ...values, c.host, c.chat_id);
        } else {
            this.run(`INSERT INTO chats (project_id, chain_id, parent_chat_id, relation, phase, focus, ownership,
          observed_title, observed_revision, last_written_title, last_written_revision, last_write_operation,
          frozen, frozen_reason, metadata, created_at, updated_at, host, chat_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...values, c.host, c.chat_id);
        }
    }
    newChatRow(scope, fields) {
        const now = this.now();
        return {
            host: scope.host,
            chat_id: scope.chatId,
            project_id: scope.projectId,
            chain_id: null,
            parent_chat_id: null,
            relation: "observed",
            phase: null,
            focus: null,
            ownership: "unknown",
            observed_title: null,
            observed_revision: null,
            last_written_title: null,
            last_written_revision: null,
            last_write_operation: null,
            frozen: 0,
            frozen_reason: null,
            metadata: "{}",
            created_at: now,
            updated_at: now,
            ...fields
        };
    }
    reservePhase(chainId, phase, host, chatId, source) {
        this.run("INSERT INTO phases (chain_id, phase, host, chat_id, source, created_at) VALUES (?,?,?,?,?,?)", chainId, phase, host, chatId, source, this.now());
    }
    insertOp(o) {
        const now = this.now();
        const row = {
            ...o,
            operation_id: randomUUID(),
            token: randomBytes(24).toString("base64url"),
            readback_title: null,
            readback_revision: null,
            created_at: now,
            updated_at: now
        };
        this.run(`INSERT INTO operations (operation_id, token, host, event_id, fingerprint, kind, project_id, chat_id, chain_id,
        phase, focus, state, reason, previous_title, previous_revision, desired_title, readback_title,
        readback_revision, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, row.operation_id, row.token, row.host, row.event_id, row.fingerprint, row.kind, row.project_id, row.chat_id, row.chain_id, row.phase, row.focus, row.state, row.reason, row.previous_title, row.previous_revision, row.desired_title, null, null, row.created_at, row.updated_at);
        this.journal(row.operation_id, null, row.state, row.reason);
        return row;
    }
    journal(operationId, from, to, detail) {
        this.run("INSERT INTO transitions (operation_id, from_state, to_state, detail, at) VALUES (?,?,?,?,?)", operationId, from, to, detail, this.now());
    }
    setState(op, to, reason, readback) {
        const next = {
            ...op,
            state: to,
            reason,
            readback_title: readback ? readback.title : op.readback_title,
            readback_revision: readback ? readback.revision : op.readback_revision,
            updated_at: this.now()
        };
        this.run("UPDATE operations SET state=?, reason=?, readback_title=?, readback_revision=?, updated_at=? WHERE operation_id=?", next.state, next.reason, next.readback_title, next.readback_revision, next.updated_at, op.operation_id);
        this.journal(op.operation_id, op.state, to, reason);
        return next;
    }
    freezeChat(host, chatId, reason, ownership) {
        const chat = this.getChat(host, chatId);
        if (!chat) return;
        this.upsertChat({
            ...chat,
            frozen: 1,
            frozen_reason: chat.frozen === 1 ? chat.frozen_reason : reason,
            ownership: ownership ?? chat.ownership,
            updated_at: this.now()
        }, true);
    }
    chatFrozen(op) {
        return this.getChat(op.host, op.chat_id)?.frozen === 1;
    }
    loadOp(operationId, token) {
        const op = this.getOp(operationId);
        if (!op) fail("OPERATION_NOT_FOUND", "no such operation", {
            operationId
        });
        if (!tokensEqual(op.token, token)) {
            fail("OPERATION_TOKEN_MISMATCH", "operation token does not match; use the token returned by begin", {
                operationId
            });
        }
        return op;
    }
    replay(host, eventId, fp) {
        const existing = this.getOpByEvent(host, eventId);
        if (!existing) return null;
        if (existing.fingerprint !== fp) {
            fail("EVENT_PAYLOAD_CONFLICT", "eventId was already used with a different request payload", {
                eventId,
                operationId: existing.operation_id
            });
        }
        return opView(existing, {
            token: true,
            replayed: true,
            frozen: this.chatFrozen(existing)
        });
    }
    assertNoPending(host, chatId) {
        const pending = this.getPendingOp(host, chatId);
        if (pending) {
            fail("OPERATION_PENDING", "chat has an unfinished operation; confirm, recover or abandon it first (pending operations are never taken over by timeout)", {
                operationId: pending.operation_id,
                state: pending.state
            });
        }
    }
    writePermission(chat, snap) {
        if (chat.frozen === 1) return {
            ok: false,
            reason: `frozen:${chat.frozen_reason ?? "user"}`,
            freeze: false
        };
        if (chat.ownership === "adopted" && sameObservation(chat.observed_title, chat.observed_revision, snap)) return {
            ok: true
        };
        if (snap.origin === "manual") return {
            ok: false,
            reason: "manual-origin",
            freeze: true,
            ownership: "manual"
        };
        switch(chat.ownership){
            case "ours":
                if (sameObservation(chat.last_written_title, chat.last_written_revision, snap)) return {
                    ok: true
                };
                return {
                    ok: false,
                    reason: snap.title === chat.last_written_title ? "revision-changed-after-our-write" : "title-changed-after-our-write",
                    freeze: true,
                    ownership: ownershipFromOrigin(snap.origin)
                };
            case "capturable":
            case "adopted":
                if (sameObservation(chat.observed_title, chat.observed_revision, snap)) return {
                    ok: true
                };
                if (chat.ownership === "capturable" && chat.observed_title === null && snap.origin === "auto") {
                    return {
                        ok: true,
                        observed: true
                    };
                }
                return {
                    ok: false,
                    reason: "title-changed-since-observed",
                    freeze: true,
                    ownership: ownershipFromOrigin(snap.origin)
                };
            default:
                return {
                    ok: false,
                    reason: `ownership:${chat.ownership}`,
                    freeze: false
                };
        }
    }
    mergeMetadata(existing, incoming) {
        if (!incoming) return existing;
        const merged = {
            ...JSON.parse(existing),
            ...incoming
        };
        const text = JSON.stringify(merged);
        if (Buffer.byteLength(text) > 4096) fail("INPUT_TOO_LARGE", "merged chat metadata exceeds 4096 bytes");
        return text;
    }
    begin(input) {
        const req = parseBegin(input);
        const fp = fingerprint({
            kind: "name",
            projectId: req.projectId,
            host: req.host,
            chatId: req.chatId,
            relation: req.relation,
            parentChatId: req.parentChatId,
            handoff: req.handoff ? {
                projectId: req.handoff.projectId,
                host: req.handoff.host,
                chainId: req.handoff.chainId,
                parentChatId: req.handoff.parentChatId,
                relation: req.handoff.relation,
                nonce: req.handoff.nonce,
                topic: req.handoff.topic === undefined ? null : normalizeText(req.handoff.topic)
            } : null,
            topic: req.topic === null ? null : normalizeText(req.topic),
            focus: req.focus === null ? null : normalizeText(req.focus),
            ...req.requireFullFocus ? {
                requireFullFocus: true
            } : {},
            locale: req.locale,
            maxLength: req.maxLength,
            measure: req.measure,
            metadata: req.metadata
        });
        return this.tx(()=>{
            const replayed = this.replay(req.host, req.eventId, fp);
            if (replayed) return replayed;
            const chat = this.getChat(req.host, req.chatId);
            if (chat && chat.project_id !== req.projectId) {
                fail("CHAT_SCOPE_MISMATCH", "chat is registered under another projectId", {
                    chatId: req.chatId
                });
            }
            this.assertNoPending(req.host, req.chatId);
            if (!chat || chat.relation === "observed") return this.beginUnregistered(req, fp, chat);
            return this.beginRegistered(req, fp, chat);
        });
    }
    resolveHandoff(req, consume = true) {
        const h = req.handoff;
        if (!h) return req.parentChatId;
        const row = this.one("SELECT * FROM handoffs WHERE nonce = ?", h.nonce);
        if (!row) fail("HANDOFF_UNKNOWN", "handoff nonce is not known to this registry", {
            nonce: h.nonce
        });
        const mismatch = row.project_id !== h.projectId || row.host !== h.host || row.chain_id !== h.chainId || row.parent_chat_id !== h.parentChatId || row.relation !== h.relation || h.projectId !== req.projectId || h.host !== req.host || req.relation !== null && req.relation !== h.relation || req.parentChatId !== null && req.parentChatId !== h.parentChatId;
        const chainTopic = this.getChain(row.chain_id)?.topic ?? null;
        const topicMismatch = h.topic !== undefined && normalizeText(h.topic) !== chainTopic;
        if (mismatch || topicMismatch) {
            fail("HANDOFF_SCOPE_MISMATCH", "handoff does not match the recorded project/host/chain/parent/relation/topic or this request", {
                nonce: h.nonce
            });
        }
        if (row.consumed_by_chat_id !== null && row.consumed_by_chat_id !== req.chatId) {
            fail("HANDOFF_ALREADY_USED", "handoff was already used by another chat; export a new handoff per child chat", {
                nonce: h.nonce,
                chatId: row.consumed_by_chat_id
            });
        }
        if (!consume) {
            if (row.consumed_by_chat_id !== req.chatId) {
                fail("RELATION_CONFLICT", "chat is already registered; a new handoff cannot re-parent it", {
                    nonce: h.nonce
                });
            }
            return h.parentChatId;
        }
        this.run("UPDATE handoffs SET consumed_by_chat_id = ?, consumed_at = ? WHERE nonce = ?", req.chatId, this.now(), h.nonce);
        return h.parentChatId;
    }
    beginUnregistered(req, fp, observed) {
        const relation = req.relation ?? req.handoff?.relation ?? null;
        if (!relation) {
            fail("INVALID_REQUEST", "relation (new|continue|branch|subtask) is required for a chat not yet in the registry");
        }
        const parentChatId = this.resolveHandoff(req);
        let parentChain = null;
        if (relation === "new") {
            if (parentChatId !== null) fail("INVALID_REQUEST", "relation new has no parent; use branch for a linked new chain");
        } else {
            if (parentChatId === null) {
                fail("INVALID_REQUEST", `relation ${relation} requires parentChatId or handoff; the parent is never inferred from timestamps`);
            }
            const parent = this.getChat(req.host, parentChatId);
            if (!parent || !parent.chain_id) {
                fail("PARENT_UNKNOWN", "parent chat is not in the registry; run history-import for it or pass a handoff", {
                    parentChatId
                });
            }
            if (parent.project_id !== req.projectId) {
                fail("PARENT_SCOPE_MISMATCH", "parent chat belongs to another projectId", {
                    parentChatId
                });
            }
            parentChain = this.getChain(parent.chain_id);
        }
        let chain;
        let phase;
        if (relation === "new" || relation === "branch") {
            if (req.topic === null) fail("INVALID_REQUEST", `relation ${relation} starts its own chain and requires topic`);
            chain = this.insertChain({
                chain_id: randomUUID(),
                project_id: req.projectId,
                host: req.host,
                topic: cleanTopic(req.topic),
                locale: req.locale ?? parentChain?.locale ?? "en",
                origin: relation === "new" ? "new" : "branch",
                parent_chain_id: parentChain?.chain_id ?? null,
                parent_chat_id: relation === "branch" ? parentChatId : null,
                phase_floor: 0,
                history_complete: 1,
                history_ambiguous: 0
            });
            phase = 1;
        } else {
            chain = parentChain;
            if (req.topic !== null && cleanTopic(req.topic) !== chain.topic) {
                fail("TOPIC_IMMUTABLE", "the literal topic of a chain cannot change; start a branch for a different topic", {
                    chainTopic: chain.topic
                });
            }
            if (relation === "subtask") {
                if (req.focus === null || normalizeText(req.focus) === "") fail("INVALID_REQUEST", "subtask requires focus");
                phase = null;
            } else {
                if (chain.history_complete !== 1) {
                    fail("HISTORY_INCOMPLETE", "imported history for this chain is incomplete; import the remaining pages or confirm assumeComplete", {
                        chainId: chain.chain_id
                    });
                }
                phase = this.nextPhase(chain);
            }
        }
        const snap = req.snapshot;
        const adopted = observed?.ownership === "adopted" && observed.frozen === 0 && sameObservation(observed.observed_title, observed.observed_revision, snap);
        const capture = snap.title === null || snap.newNativeSession && snap.origin === "auto" || adopted;
        const userFrozen = observed?.frozen === 1;
        const layout = layoutTitle({
            topic: chain.topic,
            phase,
            focus: req.focus,
            requireFullFocus: req.requireFullFocus,
            locale: req.locale ?? chain.locale,
            maxLength: req.maxLength ?? undefined,
            measure: req.measure ?? undefined
        });
        const desired = capture ? layout.title : null;
        const base = observed ?? this.newChatRow(req, {});
        const chat = {
            ...base,
            chain_id: chain.chain_id,
            parent_chat_id: parentChatId,
            relation,
            phase,
            focus: req.focus === null ? null : normalizeText(req.focus) || null,
            ownership: adopted ? "adopted" : capture ? "capturable" : ownershipFromOrigin(snap.origin),
            observed_title: snap.title,
            observed_revision: snap.revision,
            frozen: capture && !userFrozen ? 0 : 1,
            frozen_reason: userFrozen ? base.frozen_reason : capture ? null : `existing-title-at-capture:${snap.origin}`,
            metadata: this.mergeMetadata(base.metadata, req.metadata),
            updated_at: this.now()
        };
        this.upsertChat(chat, observed !== null);
        if (phase !== null) this.reservePhase(chain.chain_id, phase, req.host, req.chatId, "reserved");
        const writable = capture && !userFrozen;
        const op = this.insertOp({
            host: req.host,
            event_id: req.eventId,
            fingerprint: fp,
            kind: "name",
            project_id: req.projectId,
            chat_id: req.chatId,
            chain_id: chain.chain_id,
            phase,
            focus: chat.focus,
            state: writable ? phase !== null ? "reserved" : "planned" : "skipped",
            reason: writable ? null : userFrozen ? "frozen" : `existing-title:${snap.origin}`,
            previous_title: snap.title,
            previous_revision: snap.revision,
            desired_title: desired
        });
        return opView(op, {
            token: true,
            replayed: false
        });
    }
    beginRegistered(req, fp, chat) {
        if (req.relation !== null && req.relation !== chat.relation) {
            fail("RELATION_CONFLICT", "chat is already registered with another relation", {
                relation: chat.relation
            });
        }
        if (req.parentChatId !== null && req.parentChatId !== chat.parent_chat_id) {
            fail("RELATION_CONFLICT", "chat is already registered with another parent", {
                parentChatId: chat.parent_chat_id
            });
        }
        if (req.handoff) {
            const parent = this.resolveHandoff(req, false);
            if (parent !== chat.parent_chat_id) fail("RELATION_CONFLICT", "handoff parent differs from the registered parent");
        }
        const snap = req.snapshot;
        const focus = req.focus === null ? chat.focus : normalizeText(req.focus) || null;
        const metadata = this.mergeMetadata(chat.metadata, req.metadata);
        const chain = chat.chain_id ? this.getChain(chat.chain_id) : null;
        const skipImported = (reason)=>{
            if (metadata !== chat.metadata) this.upsertChat({
                ...chat,
                metadata,
                updated_at: this.now()
            }, true);
            const op = this.insertOp({
                host: req.host,
                event_id: req.eventId,
                fingerprint: fp,
                kind: "name",
                project_id: req.projectId,
                chat_id: req.chatId,
                chain_id: chat.chain_id,
                phase: chat.phase,
                focus: chat.focus,
                state: "skipped",
                reason,
                previous_title: snap.title,
                previous_revision: snap.revision,
                desired_title: null
            });
            return opView(op, {
                token: true,
                replayed: false
            });
        };
        if (!chain) {
            if (chat.relation === "imported") return skipImported("imported-without-chain");
            fail("INTERNAL", "registered chat has no chain", {
                chatId: chat.chat_id
            });
        }
        if (req.topic !== null && cleanTopic(req.topic) !== chain.topic) {
            fail("TOPIC_IMMUTABLE", "the literal topic of a chain cannot change", {
                chainTopic: chain.topic
            });
        }
        if (chat.phase === null && focus === null) {
            fail("INVALID_REQUEST", "an unnumbered (subtask) chat requires a non-empty focus; omit focus to keep the current one");
        }
        if (chat.relation === "imported" && chat.ownership !== "ours" && chat.ownership !== "adopted") {
            return skipImported("imported-history-not-rewritten");
        }
        const base = {
            host: req.host,
            event_id: req.eventId,
            fingerprint: fp,
            kind: "name",
            project_id: req.projectId,
            chat_id: req.chatId,
            chain_id: chain.chain_id,
            phase: chat.phase,
            focus,
            previous_title: snap.title,
            previous_revision: snap.revision
        };
        const permission = this.writePermission(chat, snap);
        if (!permission.ok) {
            const updated = {
                ...chat,
                metadata,
                updated_at: this.now()
            };
            if (permission.freeze) {
                updated.frozen = 1;
                updated.frozen_reason = permission.reason;
                updated.ownership = permission.ownership ?? chat.ownership;
            }
            this.upsertChat(updated, true);
            const op = this.insertOp({
                ...base,
                state: "skipped",
                reason: permission.reason,
                desired_title: null
            });
            return opView(op, {
                token: true,
                replayed: false
            });
        }
        const desired = layoutTitle({
            topic: chain.topic,
            phase: chat.phase,
            focus,
            requireFullFocus: req.requireFullFocus,
            locale: req.locale ?? chain.locale,
            maxLength: req.maxLength ?? undefined,
            measure: req.measure ?? undefined
        }).title;
        const updated = {
            ...chat,
            metadata,
            updated_at: this.now()
        };
        if (permission.observed) {
            updated.observed_title = snap.title;
            updated.observed_revision = snap.revision;
        }
        if (desired === snap.title && chat.ownership === "ours") {
            updated.focus = focus;
            this.upsertChat(updated, true);
            const op = this.insertOp({
                ...base,
                state: "verified",
                reason: "unchanged",
                desired_title: desired
            });
            return opView(op, {
                token: true,
                replayed: false
            });
        }
        this.upsertChat(updated, true);
        const op = this.insertOp({
            ...base,
            state: "planned",
            reason: null,
            desired_title: desired
        });
        return opView(op, {
            token: true,
            replayed: false
        });
    }
    applyStart(input) {
        const { f, operationId, token } = parseOpRef(input, [
            "snapshot"
        ]);
        const snap = parseSnapshot(f.raw("snapshot"), "snapshot");
        return this.tx(()=>{
            const op = this.loadOp(operationId, token);
            if (op.state === "applying" && this.chatFrozen(op)) {
                fail("OPERATION_STATE", "chat was frozen after apply-start: do not write; resolve with confirm/recover and a fresh snapshot", {
                    state: op.state,
                    frozen: true
                });
            }
            if (op.state === "applying" && sameObservation(op.previous_title, op.previous_revision, snap)) return opView(op);
            if ((op.state === "planned" || op.state === "reserved") && this.chatFrozen(op)) {
                if (sameObservation(op.previous_title, op.previous_revision, snap) && snap.title !== op.desired_title) {
                    return opView(this.setState(op, "failed", FROZEN_BEFORE_APPLY, snap));
                }
                return opView(this.resolveWithReadback(op, snap));
            }
            if (op.state !== "planned" && op.state !== "reserved") {
                fail(PENDING_STATES.includes(op.state) ? "OPERATION_STATE" : "OPERATION_TERMINAL", `cannot start applying from ${op.state}`, {
                    state: op.state
                });
            }
            if (sameObservation(op.previous_title, op.previous_revision, snap)) {
                return opView(this.setState(op, "applying", null));
            }
            if (snap.title === op.desired_title && snap.origin !== "manual") {
                fail("PRIOR_OBSERVATION_MISMATCH", "title already equals the desired title; call confirm with this readback", {
                    operationId
                });
            }
            const conflicted = this.setState(op, "conflict", "prior-observation-changed", snap);
            this.freezeChat(op.host, op.chat_id, `conflict:${op.operation_id}`, ownershipFromOrigin(snap.origin));
            return opView(conflicted);
        });
    }
    confirm(input) {
        const { f, operationId, token } = parseOpRef(input, [
            "readback",
            "writeOutcome"
        ]);
        const raw = f.raw("readback");
        const readback = raw == null ? null : parseSnapshot(raw, "readback");
        const outcome = f.oneOf("writeOutcome", [
            "ok",
            "error",
            "unknown"
        ], {
            optional: true
        }) ?? "unknown";
        return this.tx(()=>{
            const op = this.loadOp(operationId, token);
            if (!PENDING_STATES.includes(op.state)) {
                if (op.state === "verified" && readback?.title === op.desired_title) return opView(op);
                fail("OPERATION_TERMINAL", `operation is already ${op.state}`, {
                    state: op.state
                });
            }
            if (!readback) {
                if (op.state === "applied_unverified") return opView(op);
                return opView(this.setState(op, "applied_unverified", `write-outcome:${outcome};no-readback`));
            }
            return opView(this.resolveWithReadback(op, readback));
        });
    }
    recover(input) {
        const { f, operationId, token } = parseOpRef(input, [
            "snapshot"
        ]);
        const snap = parseSnapshot(f.raw("snapshot"), "snapshot");
        return this.tx(()=>{
            const op = this.loadOp(operationId, token);
            if (!PENDING_STATES.includes(op.state)) return opView(op);
            if (op.state === "planned" || op.state === "reserved") {
                if (sameObservation(op.previous_title, op.previous_revision, snap) && snap.title !== op.desired_title) {
                    return opView(this.chatFrozen(op) ? this.setState(op, "failed", FROZEN_BEFORE_APPLY, snap) : op);
                }
            }
            return opView(this.resolveWithReadback(op, snap));
        });
    }
    abandon(input) {
        const { f, operationId, token } = parseOpRef(input, [
            "reason"
        ]);
        const reason = f.str("reason", {
            optional: true,
            nullable: true,
            max: 200
        });
        return this.tx(()=>{
            const op = this.loadOp(operationId, token);
            if (op.state !== "planned" && op.state !== "reserved") {
                fail(PENDING_STATES.includes(op.state) ? "OPERATION_STATE" : "OPERATION_TERMINAL", `cannot abandon from ${op.state}; a native write may have happened, use recover with a fresh snapshot`, {
                    state: op.state
                });
            }
            return opView(this.setState(op, "failed", `abandoned${reason ? `:${reason}` : ""}`));
        });
    }
    resolveWithReadback(op, snap) {
        if (op.desired_title !== null && snap.title === op.desired_title && snap.origin !== "manual") {
            const verified = this.setState(op, "verified", null, snap);
            const chat = this.getChat(op.host, op.chat_id);
            if (chat) {
                const undo = op.kind === "undo";
                this.upsertChat({
                    ...chat,
                    ownership: "ours",
                    last_written_title: snap.title,
                    last_written_revision: snap.revision,
                    last_write_operation: op.operation_id,
                    observed_title: snap.title,
                    observed_revision: snap.revision,
                    focus: undo ? chat.focus : op.focus,
                    frozen: undo ? 1 : chat.frozen,
                    frozen_reason: chat.frozen === 1 ? chat.frozen_reason : undo ? "undone" : null,
                    updated_at: this.now()
                }, true);
            }
            return verified;
        }
        if (sameObservation(op.previous_title, op.previous_revision, snap)) {
            return this.setState(op, "failed", "write-not-observed", snap);
        }
        const conflicted = this.setState(op, "conflict", "unexpected-title", snap);
        this.freezeChat(op.host, op.chat_id, `conflict:${op.operation_id}`, ownershipFromOrigin(snap.origin));
        return conflicted;
    }
    status(input) {
        const f = Fields.of(input, "request", [
            "projectId",
            "host",
            "chatId"
        ]);
        const s = parseScope(f);
        const chat = this.getChat(s.host, s.chatId);
        if (chat && chat.project_id !== s.projectId) fail("CHAT_SCOPE_MISMATCH", "chat is registered under another projectId");
        const chain = chat?.chain_id ? this.getChain(chat.chain_id) : null;
        const pending = this.getPendingOp(s.host, s.chatId);
        const last = chat?.last_write_operation ? this.getOp(chat.last_write_operation) : null;
        return {
            chat: chat ? chatView(chat) : null,
            chain: chain ? this.chainView(chain) : null,
            pendingOperation: pending ? opView(pending, {
                frozen: chat?.frozen === 1
            }) : null,
            lastWriteOperation: last ? opView(last) : null
        };
    }
    adapterPending(input) {
        const f = Fields.of(input, "request", [
            "projectId",
            "host",
            "chatId",
            "operationId"
        ]);
        const s = parseScope(f);
        const operationId = f.id("operationId", {
            optional: true,
            nullable: true
        });
        const chat = this.getChat(s.host, s.chatId);
        if (chat && chat.project_id !== s.projectId) fail("CHAT_SCOPE_MISMATCH", "chat is registered under another projectId");
        const pending = this.getPendingOp(s.host, s.chatId);
        if (pending && pending.project_id !== s.projectId) fail("CHAT_SCOPE_MISMATCH", "pending operation belongs to another projectId");
        if (operationId !== null && pending?.operation_id !== operationId) {
            fail("OPERATION_NOT_FOUND", "no pending operation with this id for this chat", {
                operationId
            });
        }
        const frozen = chat?.frozen === 1;
        return {
            operation: pending ? opView(pending, {
                token: true,
                frozen
            }) : null,
            frozen
        };
    }
    chainStatus(input) {
        const f = Fields.of(input, "request", [
            "projectId",
            "host",
            "chainId"
        ]);
        const projectId = f.reqId("projectId");
        const host = f.oneOf("host", HOSTS);
        const chainId = f.uuid("chainId");
        const chain = this.getChain(chainId);
        if (!chain || chain.project_id !== projectId || chain.host !== host) {
            fail("INVALID_REQUEST", "chain not found in this project/host", {
                chainId
            });
        }
        const chats = this.all("SELECT * FROM chats WHERE chain_id = ? ORDER BY created_at, chat_id LIMIT 1000", chainId);
        const phases = this.all("SELECT phase, chat_id, source FROM phases WHERE chain_id = ? ORDER BY phase LIMIT 10000", chainId);
        return {
            chain: this.chainView(chain),
            chats: chats.map(chatView),
            phases: phases.map((p)=>({
                    phase: p.phase,
                    chatId: p.chat_id,
                    source: p.source
                }))
        };
    }
    freeze(input) {
        const f = Fields.of(input, "request", [
            "projectId",
            "host",
            "chatId",
            "reason"
        ]);
        const s = parseScope(f);
        const reason = f.str("reason", {
            optional: true,
            nullable: true,
            max: 200
        }) ?? "user";
        return this.tx(()=>{
            const chat = this.getChat(s.host, s.chatId);
            if (chat && chat.project_id !== s.projectId) fail("CHAT_SCOPE_MISMATCH", "chat is registered under another projectId");
            const row = {
                ...chat ?? this.newChatRow(s, {}),
                frozen: 1,
                frozen_reason: reason,
                updated_at: this.now()
            };
            this.upsertChat(row, chat !== null);
            return chatView(row);
        });
    }
    unfreeze(input) {
        const f = Fields.of(input, "request", [
            "projectId",
            "host",
            "chatId",
            "snapshot"
        ]);
        const s = parseScope(f);
        const snap = parseSnapshot(f.raw("snapshot"), "snapshot");
        return this.tx(()=>{
            const chat = this.getChat(s.host, s.chatId);
            if (!chat) fail("CHAT_UNKNOWN", "chat is not in the registry", {
                chatId: s.chatId
            });
            if (chat.project_id !== s.projectId) fail("CHAT_SCOPE_MISMATCH", "chat is registered under another projectId");
            this.assertNoPending(s.host, s.chatId);
            const stillOurs = chat.ownership === "ours" && snap.origin !== "manual" && sameObservation(chat.last_written_title, chat.last_written_revision, snap);
            const row = {
                ...chat,
                frozen: 0,
                frozen_reason: null,
                ownership: stillOurs ? "ours" : "adopted",
                observed_title: snap.title,
                observed_revision: snap.revision,
                updated_at: this.now()
            };
            this.upsertChat(row, true);
            return chatView(row);
        });
    }
    undo(input) {
        const f = Fields.of(input, "request", [
            "eventId",
            "projectId",
            "host",
            "chatId",
            "snapshot"
        ]);
        const eventId = f.reqId("eventId");
        const s = parseScope(f);
        const snap = parseSnapshot(f.raw("snapshot"), "snapshot");
        const fp = fingerprint({
            kind: "undo",
            projectId: s.projectId,
            host: s.host,
            chatId: s.chatId
        });
        return this.tx(()=>{
            const replayed = this.replay(s.host, eventId, fp);
            if (replayed) return replayed;
            const chat = this.getChat(s.host, s.chatId);
            if (!chat) fail("CHAT_UNKNOWN", "chat is not in the registry", {
                chatId: s.chatId
            });
            if (chat.project_id !== s.projectId) fail("CHAT_SCOPE_MISMATCH", "chat is registered under another projectId");
            this.assertNoPending(s.host, s.chatId);
            if (chat.frozen === 1) {
                fail("UNDO_UNAVAILABLE", "chat is frozen; unfreeze it first (a freeze blocks every write, including undo)", {
                    chatId: s.chatId,
                    frozenReason: chat.frozen_reason
                });
            }
            const last = chat.last_write_operation ? this.getOp(chat.last_write_operation) : null;
            if (chat.ownership !== "ours" || !last || last.state !== "verified" || last.kind === "undo") {
                fail("UNDO_UNAVAILABLE", "no verified write of ours to undo", {
                    chatId: s.chatId
                });
            }
            if (last.previous_title === null) {
                fail("UNDO_UNAVAILABLE", "the title before our write was empty; hosts cannot restore an empty title", {
                    chatId: s.chatId
                });
            }
            if (snap.origin === "manual" || !sameObservation(chat.last_written_title, chat.last_written_revision, snap)) {
                fail("UNDO_UNAVAILABLE", "current title is no longer our last write; it is preserved", {
                    chatId: s.chatId,
                    lastWrittenTitle: chat.last_written_title
                });
            }
            const op = this.insertOp({
                host: s.host,
                event_id: eventId,
                fingerprint: fp,
                kind: "undo",
                project_id: s.projectId,
                chat_id: s.chatId,
                chain_id: chat.chain_id,
                phase: chat.phase,
                focus: chat.focus,
                state: "planned",
                reason: `undo-of:${last.operation_id}`,
                previous_title: snap.title,
                previous_revision: snap.revision,
                desired_title: last.previous_title
            });
            return opView(op, {
                token: true,
                replayed: false
            });
        });
    }
    exportHandoff(input) {
        const f = Fields.of(input, "request", [
            "projectId",
            "host",
            "chatId",
            "relation"
        ]);
        const s = parseScope(f);
        const relation = f.oneOf("relation", [
            "continue",
            "branch",
            "subtask"
        ]);
        return this.tx(()=>{
            const chat = this.getChat(s.host, s.chatId);
            if (!chat || !chat.chain_id) fail("CHAT_UNKNOWN", "parent chat is not registered in a chain", {
                chatId: s.chatId
            });
            if (chat.project_id !== s.projectId) fail("CHAT_SCOPE_MISMATCH", "chat is registered under another projectId");
            const chain = this.getChain(chat.chain_id);
            const doc = {
                protocolVersion: 1,
                kind: HANDOFF_KIND,
                projectId: s.projectId,
                host: s.host,
                chainId: chain.chain_id,
                parentChatId: s.chatId,
                relation,
                nonce: randomUUID(),
                topic: chain.topic,
                createdAt: this.now()
            };
            this.run(`INSERT INTO handoffs (nonce, project_id, host, chain_id, parent_chat_id, relation, created_at)
         VALUES (?,?,?,?,?,?,?)`, doc.nonce, doc.projectId, doc.host, doc.chainId, doc.parentChatId, doc.relation, doc.createdAt);
            return doc;
        });
    }
    importHistory(input) {
        const f = Fields.of(input, "request", [
            "projectId",
            "host",
            "items",
            "completeness",
            "topic",
            "chainId",
            "confirmedMembers",
            "assumeComplete"
        ]);
        const projectId = f.reqId("projectId");
        const host = f.oneOf("host", HOSTS);
        const c = Fields.of(f.raw("completeness"), "completeness", [
            "complete",
            "pagesRead",
            "archivedIncluded",
            "note"
        ]);
        if (typeof c.raw("complete") !== "boolean") fail("INVALID_REQUEST", "completeness.complete must be a boolean");
        const complete = c.bool("complete", false);
        c.int("pagesRead", 0, 1_000_000, {
            optional: true
        });
        const archivedIncluded = c.bool("archivedIncluded", false);
        c.str("note", {
            optional: true,
            nullable: true,
            max: 500
        });
        const assumeComplete = f.bool("assumeComplete", false);
        const topicFilter = f.has("topic") && f.raw("topic") !== null ? cleanTopic(f.reqStr("topic")) : null;
        const targetChainId = f.uuid("chainId", {
            optional: true,
            nullable: true
        });
        if (targetChainId && topicFilter === null) fail("INVALID_REQUEST", "chainId requires an explicit topic");
        const rawItems = f.array("items", MAX_HISTORY_IMPORT_ITEMS);
        const items = rawItems.map((value, i)=>{
            const it = Fields.of(value, `items[${i}]`, [
                "chatId",
                "title",
                "origin",
                "revision",
                "archived"
            ]);
            return {
                chatId: it.reqId("chatId"),
                title: it.str("title", {
                    nullable: true,
                    allowEmpty: true,
                    max: 1024
                }),
                origin: it.oneOf("origin", [
                    "auto",
                    "manual",
                    "unknown",
                    "ours"
                ]),
                revision: it.str("revision", {
                    optional: true,
                    nullable: true,
                    max: 256
                }),
                archived: it.bool("archived", false)
            };
        });
        if (new Set(items.map((i)=>i.chatId)).size !== items.length) fail("INVALID_REQUEST", "duplicate chatId in items");
        const confirmations = new Map();
        for (const [i, value] of (f.array("confirmedMembers", 100, {
            optional: true
        }) ?? []).entries()){
            const cf = Fields.of(value, `confirmedMembers[${i}]`, [
                "topic",
                "chatIds"
            ]);
            const t = cleanTopic(cf.reqStr("topic"));
            const set = confirmations.get(t) ?? new Set();
            for (const id of cf.array("chatIds", MAX_HISTORY_IMPORT_ITEMS)){
                if (typeof id !== "string" || !id || id.length > 256) fail("INVALID_REQUEST", "confirmedMembers chatIds must be ids");
                set.add(id);
            }
            confirmations.set(t, set);
        }
        const evidenceComplete = complete && archivedIncluded;
        return this.tx(()=>{
            const groups = new Map();
            const group = (t)=>{
                let g = groups.get(t);
                if (!g) groups.set(t, g = {
                    numbered: [],
                    unnumbered: [],
                    weak: [],
                    blocking: []
                });
                return g;
            };
            const ambiguities = [];
            const leftovers = [];
            const unattributed = [];
            let ignored = 0;
            for (const item of items){
                const p = parseTitle(item.title);
                if (p.kind === "phase") group(p.topic).numbered.push({
                    item,
                    phase: p.phase,
                    locale: p.locale
                });
                else if (p.kind === "unnumbered") group(p.topic).unnumbered.push(item);
                else if (p.kind === "ambiguous" && p.candidate) {
                    group(p.candidate.topic).weak.push({
                        item,
                        phase: p.candidate.phase,
                        locale: p.candidate.locale
                    });
                } else if (p.kind === "ambiguous") unattributed.push({
                    item,
                    reason: p.reason
                });
                else leftovers.push(item);
            }
            for (const item of leftovers){
                const bare = item.title === null ? "" : normalizeText(item.title);
                if (bare && groups.has(bare)) group(bare).unnumbered.push(item);
                else ignored++;
            }
            for (const u of unattributed){
                const title = normalizeText(u.item.title ?? "");
                const owners = [
                    ...groups.keys()
                ].filter((t)=>title.startsWith(`${t} `) || title.startsWith(`${t}·`));
                const entry = {
                    type: "unparseable-title",
                    chatId: u.item.chatId,
                    reason: u.reason
                };
                if (owners.length) for (const t of owners)group(t).blocking.push({
                    ...entry,
                    topic: t
                });
                else ambiguities.push({
                    ...entry,
                    blocking: false
                });
            }
            const folded = new Map();
            for (const t of groups.keys()){
                const k = t.toLocaleLowerCase();
                folded.set(k, [
                    ...folded.get(k) ?? [],
                    t
                ]);
            }
            for (const variants of folded.values()){
                if (variants.length > 1) for (const t of variants)group(t).blocking.push({
                    type: "topic-variants",
                    topic: t,
                    topics: variants
                });
            }
            const chains = [];
            let importedChats = 0;
            let alreadyKnown = 0;
            let anyBlocking = false;
            for (const [topic, g] of groups){
                if (topicFilter !== null && topic !== topicFilter) {
                    ignored += g.numbered.length + g.unnumbered.length + g.weak.length;
                    continue;
                }
                const local = [];
                const report = (entry, blocking)=>local.push({
                        entry,
                        blocking
                    });
                const flush = (chainTouched)=>{
                    for (const { entry, blocking } of local){
                        const effective = blocking && (chainTouched || topicFilter === topic);
                        ambiguities.push({
                            ...entry,
                            blocking: effective
                        });
                        if (effective) anyBlocking = true;
                    }
                };
                for (const b of g.blocking)report(b, true);
                let blocked = g.blocking.length > 0;
                let chain = null;
                if (targetChainId) {
                    chain = this.getChain(targetChainId);
                    if (!chain || chain.project_id !== projectId || chain.host !== host || chain.topic !== topic) {
                        fail("INVALID_REQUEST", "chainId does not match this project/host/topic", {
                            chainId: targetChainId,
                            topic
                        });
                    }
                } else {
                    const found = this.chainsByTopic(projectId, host, topic);
                    if (found.length > 1) {
                        report({
                            type: "multiple-chains-for-topic",
                            topic,
                            chainIds: found.map((x)=>x.chain_id)
                        }, true);
                        if (!assumeComplete) {
                            for (const x of found)this.run("UPDATE chains SET history_complete = 0 WHERE chain_id = ?", x.chain_id);
                        }
                        flush(true);
                        continue;
                    }
                    chain = found[0] ?? null;
                }
                const byPhase = new Map();
                for (const n of g.numbered)byPhase.set(n.phase, [
                    ...byPhase.get(n.phase) ?? [],
                    n.item
                ]);
                let floor = 0;
                const refs = [];
                for (const [phase, owners] of byPhase){
                    floor = Math.max(floor, phase);
                    if (owners.length > 1) {
                        report({
                            type: "duplicate-phase",
                            topic,
                            phase,
                            chatIds: owners.map((o)=>o.chatId)
                        }, true);
                        blocked = true;
                    } else refs.push({
                        item: owners[0],
                        phase
                    });
                }
                for (const w of g.weak){
                    report({
                        type: "weak-phase-marker",
                        topic,
                        chatId: w.item.chatId,
                        candidatePhase: w.phase
                    }, true);
                    blocked = true;
                    floor = Math.max(floor, w.phase);
                }
                const confirmed = confirmations.get(topic) ?? null;
                const memberIds = [];
                if (g.numbered.length > 0 || g.weak.length > 0) {
                    if (g.unnumbered.length > 0) {
                        report({
                            type: "unnumbered-alongside-numbered",
                            topic,
                            chatIds: g.unnumbered.map((u)=>u.chatId),
                            note: "possibly subtasks; not counted, not imported"
                        }, false);
                    }
                } else if (g.unnumbered.length > 0 && confirmed === null) {
                    report({
                        type: "unnumbered-history-needs-confirmation",
                        topic,
                        candidateChatIds: g.unnumbered.map((u)=>u.chatId)
                    }, true);
                    blocked = true;
                }
                if (confirmed !== null) {
                    const inItems = new Map(g.unnumbered.map((u)=>[
                            u.chatId,
                            u
                        ]));
                    const already = new Set(chain ? this.all("SELECT chat_id FROM confirmed_members WHERE chain_id = ? AND host = ?", chain.chain_id, host).map((r)=>r.chat_id) : []);
                    const invalid = [
                        ...confirmed
                    ].filter((id)=>!inItems.has(id) && !already.has(id));
                    if (invalid.length) {
                        fail("INVALID_REQUEST", "confirmedMembers must be unnumbered chats of this topic in items, or already confirmed members", {
                            topic,
                            invalid
                        });
                    }
                    for (const id of confirmed){
                        const u = inItems.get(id);
                        if (u) refs.push({
                            item: u,
                            phase: null
                        });
                        memberIds.push(id);
                    }
                }
                const hasEvidence = byPhase.size > 0 || memberIds.length > 0;
                if (!chain && !hasEvidence) {
                    flush(false);
                    continue;
                }
                let created = false;
                if (!chain) {
                    chain = this.insertChain({
                        chain_id: randomUUID(),
                        project_id: projectId,
                        host,
                        topic,
                        locale: g.numbered[0]?.locale ?? "en",
                        origin: "imported",
                        parent_chain_id: null,
                        parent_chat_id: null,
                        phase_floor: 0,
                        history_complete: 0,
                        history_ambiguous: 0
                    });
                    created = true;
                }
                for (const ref of refs){
                    const existing = this.getChat(host, ref.item.chatId);
                    if (existing) {
                        if (existing.chain_id === chain.chain_id && existing.project_id === projectId) alreadyKnown++;
                        else {
                            report({
                                type: "chat-registered-elsewhere",
                                topic,
                                chatId: ref.item.chatId,
                                chainId: existing.chain_id
                            }, true);
                            blocked = true;
                            const at = memberIds.indexOf(ref.item.chatId);
                            if (at >= 0) memberIds.splice(at, 1);
                        }
                        continue;
                    }
                    if (ref.phase !== null) {
                        const taken = this.one("SELECT chat_id FROM phases WHERE chain_id = ? AND phase = ?", chain.chain_id, ref.phase);
                        if (taken && taken.chat_id !== ref.item.chatId) {
                            report({
                                type: "phase-taken",
                                topic,
                                phase: ref.phase,
                                chatId: ref.item.chatId,
                                heldBy: taken.chat_id
                            }, true);
                            blocked = true;
                            continue;
                        }
                        if (!taken) this.reservePhase(chain.chain_id, ref.phase, host, ref.item.chatId, "imported");
                    }
                    this.upsertChat(this.newChatRow({
                        projectId,
                        host,
                        chatId: ref.item.chatId
                    }, {
                        chain_id: chain.chain_id,
                        relation: "imported",
                        phase: ref.phase,
                        ownership: ownershipFromOrigin(ref.item.origin),
                        observed_title: ref.item.title,
                        observed_revision: ref.item.revision
                    }), false);
                    importedChats++;
                }
                for (const id of memberIds){
                    this.run("INSERT OR IGNORE INTO confirmed_members (chain_id, host, chat_id, created_at) VALUES (?,?,?,?)", chain.chain_id, host, id, this.now());
                }
                const members = this.one("SELECT COUNT(*) AS n FROM confirmed_members WHERE chain_id = ?", chain.chain_id)?.n ?? 0;
                const nextFloor = Math.max(chain.phase_floor, floor, members);
                let ambiguous = chain.history_ambiguous;
                let completeFlag;
                if (assumeComplete) {
                    ambiguous = 0;
                    completeFlag = 1;
                } else if (blocked) {
                    ambiguous = 1;
                    completeFlag = 0;
                } else {
                    completeFlag = evidenceComplete && ambiguous === 0 ? 1 : 0;
                }
                this.run("UPDATE chains SET phase_floor = ?, history_complete = ?, history_ambiguous = ? WHERE chain_id = ?", nextFloor, completeFlag, ambiguous, chain.chain_id);
                chain = {
                    ...chain,
                    phase_floor: nextFloor,
                    history_complete: completeFlag,
                    history_ambiguous: ambiguous
                };
                flush(true);
                chains.push({
                    ...this.chainView(chain),
                    created
                });
            }
            const warnings = [];
            if (!evidenceComplete || anyBlocking) {
                warnings.push(assumeComplete ? "history evidence was incomplete or ambiguous; assumeComplete was explicitly confirmed by the caller" : "history is incomplete or ambiguous: absence of earlier phases is NOT proven; continuing affected chains is blocked until a complete, unambiguous import (all pages, archives included) or explicit assumeComplete");
            }
            if (!archivedIncluded) warnings.push("archived chats were not included in this import");
            return {
                conclusion: evidenceComplete && !anyBlocking ? "complete" : "incomplete",
                chains,
                importedChats,
                alreadyKnown,
                ignored,
                ambiguities,
                warnings
            };
        });
    }
    evaluateHistoryItem(projectId, host, item, opts, proposed) {
        const chat = this.getChat(host, item.chatId);
        const snap = item.snapshot;
        const result = (action, reason, extra = {})=>({
                chatId: item.chatId,
                action,
                reason,
                currentTitle: snap.title,
                desiredTitle: null,
                chainId: chat?.chain_id ?? null,
                phase: chat?.phase ?? null,
                chat,
                newPhaseReservation: false,
                ...extra
            });
        if (chat && chat.project_id !== projectId) return result("invalid", "chat-in-other-project");
        if (this.getPendingOp(host, item.chatId)) return result("skip", "operation-pending");
        if (chat?.frozen === 1) return result("skip", `frozen:${chat.frozen_reason ?? "user"}`);
        const adopted = chat?.ownership === "adopted" && sameObservation(chat.observed_title, chat.observed_revision, snap);
        if (snap.origin === "manual" && !adopted) return result("skip", "manual-title");
        if (chat && !adopted) {
            const baseline = chat.ownership === "ours" ? sameObservation(chat.last_written_title, chat.last_written_revision, snap) : [
                "capturable",
                "adopted",
                "auto"
            ].includes(chat.ownership) ? sameObservation(chat.observed_title, chat.observed_revision, snap) && (chat.ownership !== "auto" || nonHumanOrigin(snap.origin)) : false;
            if (!baseline) {
                return result("skip", [
                    "manual",
                    "unknown"
                ].includes(chat.ownership) ? `${chat.ownership}-title` : "changed-since-observed");
            }
        } else if (!chat && snap.title !== null && !nonHumanOrigin(snap.origin)) {
            return result("skip", "unknown-title-origin");
        }
        let topic;
        try {
            topic = cleanTopic(item.topic);
        } catch (error) {
            return result("invalid", error.code ?? "INVALID_TOPIC");
        }
        let chain = chat?.chain_id ? this.getChain(chat.chain_id) : null;
        if (chain && chain.topic !== topic) return result("invalid", "topic-differs-from-chain");
        if (!chain) {
            const found = this.chainsByTopic(projectId, host, topic);
            if (found.length > 1) return result("invalid", "multiple-chains-for-topic");
            chain = found[0] ?? null;
        }
        if (!chain) return result("invalid", "chain-unknown:run-history-import-first");
        let newPhaseReservation = false;
        if (item.phase !== null) {
            if (chat?.phase != null && chat.phase !== item.phase) return result("invalid", "chat-already-has-phase", {
                phase: chat.phase
            });
            const key = `${chain.chain_id}:${item.phase}`;
            if (proposed.has(key)) return result("conflict", "phase-proposed-twice", {
                chainId: chain.chain_id,
                phase: item.phase
            });
            proposed.add(key);
            const taken = this.one("SELECT host, chat_id FROM phases WHERE chain_id = ? AND phase = ?", chain.chain_id, item.phase);
            if (taken && (taken.chat_id !== item.chatId || taken.host !== host)) {
                return result("conflict", "phase-taken", {
                    chainId: chain.chain_id,
                    phase: item.phase
                });
            }
            newPhaseReservation = !taken;
        }
        let desired;
        try {
            desired = layoutTitle({
                topic,
                phase: item.phase,
                focus: item.focus,
                locale: opts.locale ?? chain?.locale ?? "en",
                maxLength: opts.maxLength ?? undefined,
                measure: opts.measure ?? undefined
            }).title;
        } catch (error) {
            return result("invalid", error.code ?? "INVALID_REQUEST", {
                chainId: chain?.chain_id ?? null,
                phase: item.phase
            });
        }
        const extra = {
            desiredTitle: desired,
            chainId: chain?.chain_id ?? null,
            phase: item.phase,
            newPhaseReservation
        };
        if (desired === snap.title) return result("noop", "already-canonical", extra);
        return result("rename", null, extra);
    }
    parseHistoryRequest(input, extraKeys) {
        const f = Fields.of(input, "request", [
            "projectId",
            "host",
            "items",
            "locale",
            "maxLength",
            "measure",
            ...extraKeys
        ]);
        const projectId = f.reqId("projectId");
        const host = f.oneOf("host", HOSTS);
        return {
            f,
            projectId,
            host,
            opts: parseTitleOptions(f),
            items: parseHistoryItems(f, MAX_HISTORY_APPLY_ITEMS)
        };
    }
    previewHistory(input) {
        const { projectId, host, opts, items } = this.parseHistoryRequest(input, []);
        const proposed = new Set();
        const results = items.map((item)=>{
            const { chat: _chat, newPhaseReservation: _n, ...view } = this.evaluateHistoryItem(projectId, host, item, opts, proposed);
            return view;
        });
        const summary = {
            rename: 0,
            noop: 0,
            skip: 0,
            conflict: 0,
            invalid: 0
        };
        for (const r of results)summary[r.action]++;
        return {
            items: results,
            summary
        };
    }
    applyHistory(input) {
        const { f, projectId, host, opts, items } = this.parseHistoryRequest(input, [
            "batchId"
        ]);
        const batchId = f.id("batchId");
        if (batchId.length > 128) fail("INVALID_REQUEST", "batchId must be at most 128 characters");
        const results = [];
        for (const item of items){
            const eventId = `history:${batchId}:${item.chatId}`;
            const fp = fingerprint({
                kind: "history",
                projectId,
                host,
                chatId: item.chatId,
                topic: normalizeText(item.topic),
                phase: item.phase,
                focus: item.focus === null ? null : normalizeText(item.focus),
                ...opts
            });
            try {
                results.push(this.tx(()=>{
                    const replayed = this.replay(host, eventId, fp);
                    if (replayed) {
                        return {
                            chatId: item.chatId,
                            action: replayed.state === "skipped" ? "skip" : "rename",
                            reason: replayed.reason,
                            currentTitle: replayed.previousTitle,
                            desiredTitle: replayed.desiredTitle,
                            chainId: replayed.chainId,
                            phase: replayed.phase,
                            operation: replayed
                        };
                    }
                    const ev = this.evaluateHistoryItem(projectId, host, item, opts, new Set());
                    const { chat, newPhaseReservation, ...view } = ev;
                    if (ev.action === "invalid" || ev.action === "conflict" || ev.action === "noop") return view;
                    const op = (state, reason)=>this.insertOp({
                            host,
                            event_id: eventId,
                            fingerprint: fp,
                            kind: "history",
                            project_id: projectId,
                            chat_id: item.chatId,
                            chain_id: ev.chainId,
                            phase: ev.phase,
                            focus: item.focus === null ? null : normalizeText(item.focus) || null,
                            state,
                            reason,
                            previous_title: item.snapshot.title,
                            previous_revision: item.snapshot.revision,
                            desired_title: ev.desiredTitle
                        });
                    if (ev.action === "skip") return {
                        ...view,
                        operation: opView(op("skipped", ev.reason))
                    };
                    const row = chat ? {
                        ...chat,
                        chain_id: chat.chain_id ?? ev.chainId,
                        phase: chat.phase ?? ev.phase,
                        updated_at: this.now()
                    } : this.newChatRow({
                        projectId,
                        host,
                        chatId: item.chatId
                    }, {
                        chain_id: ev.chainId,
                        relation: "imported",
                        phase: ev.phase,
                        ownership: item.snapshot.title === null ? "capturable" : "auto",
                        observed_title: item.snapshot.title,
                        observed_revision: item.snapshot.revision
                    });
                    this.upsertChat(row, chat !== null);
                    if (newPhaseReservation && ev.chainId && ev.phase !== null) {
                        this.reservePhase(ev.chainId, ev.phase, host, item.chatId, "history");
                    }
                    return {
                        ...view,
                        operation: opView(op(newPhaseReservation ? "reserved" : "planned", null), {
                            token: true
                        })
                    };
                }));
            } catch (error) {
                if (!(error instanceof NamingError)) throw error;
                results.push({
                    chatId: item.chatId,
                    action: "invalid",
                    reason: `${error.code}: ${error.message}`,
                    currentTitle: item.snapshot.title,
                    desiredTitle: null,
                    chainId: null,
                    phase: null
                });
            }
        }
        const summary = {
            rename: 0,
            noop: 0,
            skip: 0,
            conflict: 0,
            invalid: 0
        };
        for (const r of results)summary[r.action]++;
        return {
            items: results,
            summary
        };
    }
}
