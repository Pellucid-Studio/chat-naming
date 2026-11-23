// Generated from packages/chat-naming/core/protocol.ts by hosts/claude/directory/build.py.
// Types were stripped; the logic is unchanged. Edit the TypeScript source, not this file.
import { NamingEngine } from "./engine.mjs";
import { NamingError, fail } from "./errors.mjs";
import { SCHEMA_VERSION } from "./registry.mjs";
import { HOSTS, isPlainObject } from "./validate.mjs";
export const PROTOCOL_VERSION = 1;
export const COMMANDS = [
    "version",
    "begin",
    "apply-start",
    "confirm",
    "recover",
    "abandon",
    "status",
    "chain-status",
    "freeze",
    "unfreeze",
    "undo",
    "handoff-export",
    "history-import",
    "history-preview",
    "history-apply",
    "adapter-pending"
];
export const READ_ONLY_COMMANDS = new Set([
    "status",
    "chain-status",
    "history-preview",
    "adapter-pending"
]);
export const TRUSTED_ADAPTER_COMMANDS = new Set([
    "adapter-pending"
]);
function dispatch(engine, command, payload) {
    switch(command){
        case "begin":
            return engine.begin(payload);
        case "apply-start":
            return engine.applyStart(payload);
        case "confirm":
            return engine.confirm(payload);
        case "recover":
            return engine.recover(payload);
        case "abandon":
            return engine.abandon(payload);
        case "status":
            return engine.status(payload);
        case "chain-status":
            return engine.chainStatus(payload);
        case "freeze":
            return engine.freeze(payload);
        case "unfreeze":
            return engine.unfreeze(payload);
        case "undo":
            return engine.undo(payload);
        case "handoff-export":
            return engine.exportHandoff(payload);
        case "history-import":
            return engine.importHistory(payload);
        case "history-preview":
            return engine.previewHistory(payload);
        case "history-apply":
            return engine.applyHistory(payload);
        case "adapter-pending":
            return engine.adapterPending(payload);
        default:
            return fail("UNKNOWN_COMMAND", `unknown command ${command}`);
    }
}
export function errorResponse(command, error) {
    const e = error instanceof NamingError ? error : new NamingError("INTERNAL", error instanceof Error ? error.message : String(error));
    return {
        ok: false,
        protocolVersion: 1,
        command,
        error: e.toJSON()
    };
}
export function handleRequest(request, options) {
    let command = null;
    try {
        if (!isPlainObject(request)) fail("INVALID_REQUEST", "request must be a JSON object");
        const { protocolVersion, command: rawCommand, ...payload } = request;
        if (typeof rawCommand === "string") command = rawCommand;
        if (protocolVersion !== PROTOCOL_VERSION) {
            fail("UNSUPPORTED_PROTOCOL", "protocolVersion must be 1", {
                supported: [
                    PROTOCOL_VERSION
                ]
            });
        }
        if (typeof rawCommand !== "string" || !COMMANDS.includes(rawCommand)) {
            fail("UNKNOWN_COMMAND", "unknown or missing command", {
                commands: [
                    ...COMMANDS
                ]
            });
        }
        const cmd = rawCommand;
        if (cmd === "version") {
            if (Object.keys(payload).length) fail("INVALID_REQUEST", "version takes no fields");
            return {
                ok: true,
                protocolVersion: 1,
                command: cmd,
                result: {
                    protocolVersion: PROTOCOL_VERSION,
                    schemaVersion: SCHEMA_VERSION,
                    hosts: HOSTS,
                    commands: COMMANDS
                }
            };
        }
        if (TRUSTED_ADAPTER_COMMANDS.has(cmd) && options.trustedAdapter !== true) {
            fail("TRUSTED_ADAPTER_REQUIRED", `${cmd} is available only to the trusted local adapter (--trusted-adapter)`);
        }
        const engine = NamingEngine.open({
            stateDir: options.stateDir,
            readOnly: READ_ONLY_COMMANDS.has(cmd),
            busyTimeoutMs: options.busyTimeoutMs,
            clock: options.clock
        });
        try {
            return {
                ok: true,
                protocolVersion: 1,
                command: cmd,
                result: dispatch(engine, cmd, payload)
            };
        } finally{
            engine.close();
        }
    } catch (error) {
        return errorResponse(command, error);
    }
}
