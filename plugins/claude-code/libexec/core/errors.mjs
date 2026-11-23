// Generated from packages/chat-naming/core/errors.ts by hosts/claude/directory/build.py.
// Types were stripped; the logic is unchanged. Edit the TypeScript source, not this file.
export class NamingError extends Error {
    code;
    details;
    constructor(code, message, details = {}){
        super(message);
        this.name = "NamingError";
        this.code = code;
        this.details = details;
    }
    toJSON() {
        return {
            code: this.code,
            message: this.message,
            details: this.details
        };
    }
}
export function fail(code, message, details = {}) {
    throw new NamingError(code, message, details);
}
