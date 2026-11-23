// Generated from packages/chat-naming/hosts/claude/src/core-backend.ts by hosts/claude/directory/build.py.
// Types were stripped; the logic is unchanged. Edit the TypeScript source, not this file.
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { NamingEngine, NamingError } from './core/index.mjs';
import { BackendError } from './protocol.mjs';
const HOST = 'claude';
const MAX_ID = 256;
export function projectIdFor(chat) {
    const path = chat.projectRoot ?? chat.cwd;
    if (path.length > 0 && path.length <= MAX_ID && !/[\u0000-\u001f\u007f]/.test(path) && path === path.trim()) return path;
    return 'path-sha256:' + createHash('sha256').update(path).digest('hex');
}
export function scopeFor(chat) {
    return {
        projectId: projectIdFor(chat),
        host: HOST,
        chatId: chat.sessionId
    };
}
export function snapshotOf(observed) {
    return {
        title: observed.title,
        origin: observed.origin,
        revision: null,
        newNativeSession: false
    };
}
const coreRelation = (r)=>r === 'continuation' ? 'continue' : r;
function codeOf(err) {
    return err instanceof NamingError ? String(err.code) : null;
}
function toOperation(view) {
    if (!view.token) throw new BackendError('core_contract', 'operation view without token from a token-returning call');
    if (view.desiredTitle === null) throw new BackendError('core_contract', 'pending operation without desired title');
    return {
        operationId: view.operationId,
        ownerToken: view.token,
        title: view.desiredTitle,
        previousTitle: view.previousTitle
    };
}
function phaseOf(state) {
    if (state === 'planned' || state === 'reserved') return 'reserved';
    if (state === 'applying') return 'applying';
    if (state === 'applied_unverified') return 'applied_unverified';
    return null;
}
function parseHandoff(text) {
    if (text === null) return {
        ok: true,
        value: null
    };
    try {
        return {
            ok: true,
            value: JSON.parse(text)
        };
    } catch  {
        return {
            ok: false
        };
    }
}
export class CoreBackend {
    engine;
    constructor(engine){
        this.engine = engine;
    }
    frozenNow(scope) {
        return this.engine.status(scope).chat?.frozen === true;
    }
    readback(view, scope) {
        switch(view.state){
            case 'verified':
                return {
                    kind: 'verified'
                };
            case 'failed':
                return {
                    kind: 'not_applied',
                    reason: view.reason ?? 'failed'
                };
            case 'conflict':
                return {
                    kind: 'conflict',
                    frozen: scope ? this.frozenNow(scope) : true,
                    reason: view.reason ?? 'conflict'
                };
            default:
                return {
                    kind: 'still_pending',
                    state: view.state
                };
        }
    }
    scopeOfOp(view) {
        return {
            projectId: view.projectId,
            host: HOST,
            chatId: view.chatId
        };
    }
    async recover({ chat }) {
        const scope = scopeFor(chat);
        const pending = this.engine.adapterPending(scope);
        const status = this.engine.status(scope);
        const c = status.chat;
        const verifiedTitle = c && c.ownership === 'ours' && status.lastWriteOperation?.state === 'verified' ? c.lastWrittenTitle : null;
        let out = null;
        const op = pending.operation;
        if (op) {
            const phase = phaseOf(op.state);
            if (phase !== null && op.desiredTitle !== null) out = {
                operation: toOperation(op),
                phase,
                kind: op.kind
            };
        }
        return {
            frozen: pending.frozen,
            verifiedTitle,
            pending: out
        };
    }
    async prepare(input) {
        const scope = scopeFor(input.chat);
        const pending = this.engine.adapterPending(scope).operation;
        if (pending && pending.eventId === input.idempotencyKey && pending.next === 'apply') {
            return {
                kind: 'operation',
                operation: toOperation(pending)
            };
        }
        const registered = (()=>{
            const c = this.engine.status(scope).chat;
            return c !== null && c.relation !== 'observed';
        })();
        const p = input.proposal;
        const handoff = registered ? {
            ok: true,
            value: null
        } : parseHandoff(p.handoff);
        if (!handoff.ok) {
            return {
                kind: 'rejected',
                code: 'INVALID_HANDOFF',
                reason: 'handoff must be the JSON printed by /chat-naming handoff'
            };
        }
        const handoffValue = handoff.value;
        const handoffRelation = handoffValue !== null && typeof handoffValue === 'object' && typeof handoffValue.relation === 'string' ? handoffValue.relation : null;
        const relation = handoffValue !== null ? null : coreRelation(p.relation);
        const effective = handoffRelation ?? relation;
        const startsChain = effective === 'new' || effective === 'branch';
        const request = registered ? {
            eventId: input.idempotencyKey,
            ...scope,
            focus: p.focus,
            snapshot: snapshotOf(input.observed)
        } : {
            eventId: input.idempotencyKey,
            ...scope,
            relation,
            handoff: handoff.value,
            topic: startsChain ? p.topic : null,
            focus: p.focus,
            locale: p.locale,
            snapshot: snapshotOf(input.observed)
        };
        let view;
        try {
            view = this.engine.begin({
                ...request,
                requireFullFocus: true
            });
        } catch (err) {
            const code = codeOf(err);
            if (code === null) throw err;
            const reason = err.message;
            if (code === 'OPERATION_PENDING') return {
                kind: 'pending',
                reason
            };
            return {
                kind: 'rejected',
                code,
                reason
            };
        }
        if ((view.state === 'reserved' || view.state === 'planned') && view.next === 'apply') {
            return {
                kind: 'operation',
                operation: toOperation(view)
            };
        }
        if (view.state === 'verified' && view.desiredTitle !== null) return {
            kind: 'unchanged',
            title: view.desiredTitle
        };
        if (view.state === 'skipped' || view.next === 'none') {
            return {
                kind: 'blocked',
                reason: view.reason ?? view.state,
                frozen: this.frozenNow(scope)
            };
        }
        return {
            kind: 'pending',
            reason: 'operation is ' + view.state
        };
    }
    async abandon({ op, reason }) {
        try {
            this.engine.abandon({
                operationId: op.operationId,
                token: op.ownerToken,
                reason: reason.slice(0, 200)
            });
            return {
                abandoned: true
            };
        } catch (err) {
            const code = codeOf(err);
            if (code === 'OPERATION_STATE' || code === 'OPERATION_TERMINAL') return {
                abandoned: false
            };
            throw err;
        }
    }
    async applyStart({ op, observed }) {
        let view;
        try {
            view = this.engine.applyStart({
                operationId: op.operationId,
                token: op.ownerToken,
                snapshot: snapshotOf(observed)
            });
        } catch (err) {
            const code = codeOf(err);
            const reason = err instanceof Error ? err.message : String(err);
            if (code === 'PRIOR_OBSERVATION_MISMATCH') return {
                kind: 'already_desired'
            };
            if (code === 'OPERATION_STATE') return {
                kind: 'blocked',
                reason,
                frozen: true
            };
            if (code === 'OPERATION_TERMINAL') return {
                kind: 'stale',
                reason
            };
            throw err;
        }
        switch(view.state){
            case 'applying':
                return {
                    kind: 'applying'
                };
            case 'verified':
                return {
                    kind: 'verified'
                };
            case 'failed':
            case 'conflict':
                return {
                    kind: 'blocked',
                    reason: view.reason ?? view.state,
                    frozen: this.frozenNow(this.scopeOfOp(view))
                };
            default:
                return {
                    kind: 'stale',
                    reason: 'unexpected state ' + view.state
                };
        }
    }
    async markApplied({ op, writeOutcome }) {
        this.engine.confirm({
            operationId: op.operationId,
            token: op.ownerToken,
            writeOutcome
        });
    }
    async confirm({ op, observed }) {
        try {
            const view = this.engine.confirm({
                operationId: op.operationId,
                token: op.ownerToken,
                readback: snapshotOf(observed)
            });
            return this.readback(view, this.scopeOfOp(view));
        } catch (err) {
            if (codeOf(err) === 'OPERATION_TERMINAL') return {
                kind: 'still_pending',
                state: 'terminal'
            };
            throw err;
        }
    }
    async resolveInDoubt({ op, observed }) {
        const view = this.engine.recover({
            operationId: op.operationId,
            token: op.ownerToken,
            snapshot: snapshotOf(observed)
        });
        return this.readback(view, this.scopeOfOp(view));
    }
    async freeze({ chat, reason }) {
        return {
            frozen: this.engine.freeze({
                ...scopeFor(chat),
                reason: reason.slice(0, 200)
            }).frozen
        };
    }
    async unfreeze({ chat, observed }) {
        try {
            this.engine.unfreeze({
                ...scopeFor(chat),
                snapshot: snapshotOf(observed)
            });
            return {
                kind: 'unfrozen'
            };
        } catch (err) {
            const code = codeOf(err);
            if (code === 'CHAT_UNKNOWN') return {
                kind: 'not_registered'
            };
            if (code === 'OPERATION_PENDING') return {
                kind: 'pending',
                reason: err.message
            };
            throw err;
        }
    }
    async exportHandoff({ chat, relation }) {
        try {
            const doc = this.engine.exportHandoff({
                ...scopeFor(chat),
                relation: coreRelation(relation)
            });
            return {
                kind: 'handoff',
                document: JSON.stringify(doc)
            };
        } catch (err) {
            const code = codeOf(err);
            if (code === null) throw err;
            return {
                kind: 'rejected',
                code,
                reason: err.message
            };
        }
    }
}
export function openCoreBackend(options) {
    mkdirSync(options.stateDir, {
        recursive: true,
        mode: 0o700
    });
    const engine = NamingEngine.open({
        stateDir: options.stateDir,
        busyTimeoutMs: options.busyTimeoutMs
    });
    return {
        backend: new CoreBackend(engine),
        close: ()=>engine.close()
    };
}
