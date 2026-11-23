// Generated from packages/chat-naming/hosts/claude/src/protocol.ts by hosts/claude/directory/build.py.
// Types were stripped; the logic is unchanged. Edit the TypeScript source, not this file.
import { PROTOCOL } from './types.mjs';
export const METHODS = [
    'recover',
    'prepare',
    'abandon',
    'applyStart',
    'markApplied',
    'confirm',
    'resolveInDoubt',
    'freeze',
    'unfreeze',
    'exportHandoff'
];
export class BackendError extends Error {
    code;
    constructor(code, message){
        super(message), this.code = code;
        this.name = 'BackendError';
    }
}
export function isObject(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
export function encodeRequest(op, input) {
    return JSON.stringify({
        protocol: PROTOCOL,
        op,
        input
    });
}
export function decodeResponse(op, stdout) {
    let parsed;
    try {
        parsed = JSON.parse(stdout);
    } catch  {
        throw new BackendError('bad_json', `${op}: helper stdout is not JSON`);
    }
    if (!isObject(parsed) || parsed.protocol !== PROTOCOL) {
        throw new BackendError('bad_protocol', `${op}: unexpected protocol`);
    }
    if (parsed.ok !== true) {
        const err = isObject(parsed.error) ? parsed.error : {};
        throw new BackendError(String(err.code ?? 'helper_error'), `${op}: ${String(err.message ?? 'failed')}`);
    }
    return parsed.output;
}
export function protocolError(code, message) {
    return JSON.stringify({
        protocol: PROTOCOL,
        ok: false,
        error: {
            code,
            message
        }
    });
}
const errorResponse = protocolError;
export async function dispatch(backend, raw) {
    let req;
    try {
        req = JSON.parse(raw);
    } catch  {
        return errorResponse('bad_json', 'request is not JSON');
    }
    if (!isObject(req) || req.protocol !== PROTOCOL) return errorResponse('bad_protocol', 'unexpected protocol');
    const op = req.op;
    if (typeof op !== 'string' || !METHODS.includes(op)) {
        return errorResponse('bad_op', 'unknown op');
    }
    if (!isObject(req.input)) return errorResponse('bad_input', 'input must be an object');
    try {
        const fn = backend[op];
        const output = await fn.call(backend, req.input);
        return JSON.stringify({
            protocol: PROTOCOL,
            ok: true,
            output: output ?? {}
        });
    } catch (err) {
        return errorResponse(errorCode(err), err instanceof Error ? err.message : String(err));
    }
}
export function errorCode(err) {
    if (err instanceof BackendError) return err.code;
    const code = isObject(err) || err instanceof Error ? err.code : undefined;
    return typeof code === 'string' && code !== '' ? code : 'backend_error';
}
