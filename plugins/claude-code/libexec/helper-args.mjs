// Generated from packages/chat-naming/hosts/claude/src/helper-args.ts by hosts/claude/directory/build.py.
// Types were stripped; the logic is unchanged. Edit the TypeScript source, not this file.
export function parseHelperArgs(argv) {
    const i = argv.indexOf('--state-dir');
    const dir = i >= 0 ? argv[i + 1] : undefined;
    if (dir === undefined || dir === '') return {
        error: '--state-dir <absolute path> is required'
    };
    const absolute = dir.startsWith('/') || /^[A-Za-z]:[\\/]/.test(dir) || /^\\\\[^\\/]+[\\/][^\\/]+/.test(dir);
    if (!absolute) return {
        error: '--state-dir must be an absolute path'
    };
    if (dir.split(/[\\/]/).includes('..')) return {
        error: '--state-dir must not contain ".."'
    };
    return {
        stateDir: dir
    };
}
