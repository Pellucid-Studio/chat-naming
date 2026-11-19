// Generated from packages/chat-naming/core/validate.ts by hosts/claude/directory/build.py.
// Types were stripped; the logic is unchanged. Edit the TypeScript source, not this file.
import { fail } from "./errors.mjs";
export const MAX_INPUT_BYTES = 1_048_576;
export const MAX_DEPTH = 8;
export const MAX_NODES = 50_000;
export const MAX_STRING = 4096;
export const MAX_TITLE = 1024;
export const MAX_ID = 256;
export const MAX_METADATA_BYTES = 4096;
export const HOSTS = [
    "codex",
    "claude",
    "antigravity",
    "opencode"
];
export const ORIGINS = [
    "auto",
    "manual",
    "unknown",
    "ours"
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL = /[\p{Cc}]/u;
const FORBIDDEN_KEYS = new Set([
    "__proto__",
    "constructor",
    "prototype"
]);
export function parseJsonText(text) {
    if (Buffer.byteLength(text, "utf8") > MAX_INPUT_BYTES) {
        fail("INPUT_TOO_LARGE", `request exceeds ${MAX_INPUT_BYTES} bytes`);
    }
    let value;
    try {
        value = JSON.parse(text);
    } catch (error) {
        fail("INVALID_REQUEST", `request is not valid JSON: ${error.message}`);
    }
    checkBounded(value);
    return value;
}
export function checkBounded(value) {
    let nodes = 0;
    const walk = (v, depth)=>{
        if (++nodes > MAX_NODES) fail("INPUT_TOO_LARGE", `request has more than ${MAX_NODES} JSON nodes`);
        if (depth > MAX_DEPTH) fail("INVALID_REQUEST", `request nesting exceeds depth ${MAX_DEPTH}`);
        if (typeof v === "string" && v.length > MAX_STRING * 4) fail("INPUT_TOO_LARGE", "string value too long");
        if (Array.isArray(v)) for (const item of v)walk(item, depth + 1);
        else if (v !== null && typeof v === "object") {
            for (const [k, item] of Object.entries(v)){
                if (FORBIDDEN_KEYS.has(k)) fail("INVALID_REQUEST", `forbidden key "${k}"`);
                walk(item, depth + 1);
            }
        }
    };
    walk(value, 0);
}
export function isPlainObject(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}
export class Fields {
    obj;
    path;
    constructor(obj, path){
        this.obj = obj;
        this.path = path;
    }
    static of(value, path, allowed) {
        if (!isPlainObject(value)) fail("INVALID_REQUEST", `${path} must be a JSON object`);
        for (const key of Object.keys(value)){
            if (!allowed.includes(key)) {
                fail("INVALID_REQUEST", `unknown field ${path}.${key}`, {
                    allowed: [
                        ...allowed
                    ]
                });
            }
        }
        return new Fields(value, path);
    }
    has(key) {
        return this.obj[key] !== undefined;
    }
    present(key, opt) {
        const v = this.obj[key];
        if (v === undefined) {
            if (opt.optional) return false;
            fail("INVALID_REQUEST", `missing field ${this.path}.${key}`);
        }
        if (v === null) {
            if (opt.nullable) return false;
            fail("INVALID_REQUEST", `${this.path}.${key} must not be null`);
        }
        return true;
    }
    str(key, opt = {}) {
        if (!this.present(key, opt)) return null;
        const v = this.obj[key];
        if (typeof v !== "string") fail("INVALID_REQUEST", `${this.path}.${key} must be a string`);
        if (v.length > (opt.max ?? MAX_STRING)) fail("INVALID_REQUEST", `${this.path}.${key} is too long`);
        if (!opt.allowEmpty && v.trim() === "") fail("INVALID_REQUEST", `${this.path}.${key} must not be empty`);
        return v;
    }
    reqStr(key, opt = {}) {
        return this.str(key, opt);
    }
    id(key, opt = {}) {
        const v = this.str(key, {
            ...opt,
            max: MAX_ID
        });
        if (v !== null && (CONTROL.test(v) || v !== v.trim())) {
            fail("INVALID_REQUEST", `${this.path}.${key} must not contain control characters or surrounding spaces`);
        }
        return v;
    }
    reqId(key) {
        return this.id(key);
    }
    uuid(key, opt = {}) {
        const v = this.id(key, opt);
        if (v !== null && !UUID.test(v)) fail("INVALID_REQUEST", `${this.path}.${key} must be a UUID`);
        return v === null ? null : v.toLowerCase();
    }
    int(key, min, max, opt = {}) {
        if (!this.present(key, opt)) return null;
        const v = this.obj[key];
        if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
            fail("INVALID_REQUEST", `${this.path}.${key} must be an integer in ${min}..${max}`);
        }
        return v;
    }
    bool(key, fallback) {
        const v = this.obj[key];
        if (v === undefined) return fallback;
        if (typeof v !== "boolean") fail("INVALID_REQUEST", `${this.path}.${key} must be a boolean`);
        return v;
    }
    oneOf(key, values, opt = {}) {
        if (!this.present(key, opt)) return null;
        const v = this.obj[key];
        if (typeof v !== "string" || !values.includes(v)) {
            fail("INVALID_REQUEST", `${this.path}.${key} must be one of ${values.join("|")}`);
        }
        return v;
    }
    array(key, max, opt = {}) {
        if (!this.present(key, opt)) return null;
        const v = this.obj[key];
        if (!Array.isArray(v)) fail("INVALID_REQUEST", `${this.path}.${key} must be an array`);
        if (v.length > max) fail("INPUT_TOO_LARGE", `${this.path}.${key} has more than ${max} items`, {
            max
        });
        return v;
    }
    raw(key) {
        return this.obj[key];
    }
}
export function parseSnapshot(value, path) {
    const f = Fields.of(value, path, [
        "title",
        "origin",
        "revision",
        "newNativeSession"
    ]);
    if (!("title" in f.obj)) fail("INVALID_REQUEST", `missing field ${path}.title (use null for an untitled chat)`);
    const title = f.str("title", {
        nullable: true,
        max: MAX_TITLE,
        allowEmpty: true
    });
    const revision = f.str("revision", {
        optional: true,
        nullable: true,
        max: MAX_ID
    });
    return {
        title: title === "" ? null : title,
        origin: f.oneOf("origin", ORIGINS),
        revision,
        newNativeSession: f.bool("newNativeSession", false)
    };
}
export function parseMetadata(value, path) {
    if (value === undefined || value === null) return null;
    if (!isPlainObject(value)) fail("INVALID_REQUEST", `${path} must be a JSON object`);
    const text = JSON.stringify(value);
    if (Buffer.byteLength(text, "utf8") > MAX_METADATA_BYTES) {
        fail("INPUT_TOO_LARGE", `${path} exceeds ${MAX_METADATA_BYTES} bytes`);
    }
    return value;
}
export function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (isPlainObject(value)) {
        const keys = Object.keys(value).filter((k)=>value[k] !== undefined).sort();
        return `{${keys.map((k)=>`${JSON.stringify(k)}:${stableJson(value[k])}`).join(",")}}`;
    }
    return JSON.stringify(value ?? null);
}
