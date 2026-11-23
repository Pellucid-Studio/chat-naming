// Generated from packages/chat-naming/core/title.ts by hosts/claude/directory/build.py.
// Types were stripped; the logic is unchanged. Edit the TypeScript source, not this file.
import { fail } from "./errors.mjs";
export const PHASE_WORD = {
    ru: "фаза",
    en: "phase"
};
export const TOPIC_SEPARATOR = " · ";
export const FOCUS_SEPARATOR = " — ";
export const ELLIPSIS = "…";
export const DEFAULT_MAX_LENGTH = 60;
export const MIN_MAX_LENGTH = 8;
export const MAX_MAX_LENGTH = 512;
export const MAX_PHASE = 999_999;
const segmenter = new Intl.Segmenter(undefined, {
    granularity: "grapheme"
});
const BIDI_RANGES = `${String.fromCharCode(0x202a)}-${String.fromCharCode(0x202e)}` + `${String.fromCharCode(0x2066)}-${String.fromCharCode(0x2069)}`;
const FORBIDDEN = new RegExp(`[\\p{Cc}${BIDI_RANGES}]`, "u");
export function normalizeText(value) {
    return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}
export function graphemes(value) {
    return Array.from(segmenter.segment(value), (s)=>s.segment);
}
function isWide(grapheme) {
    if (/\p{Extended_Pictographic}/u.test(grapheme) || grapheme.includes("️")) return true;
    const cp = grapheme.codePointAt(0) ?? 0;
    return cp >= 0x1100 && cp <= 0x115f || cp >= 0x2e80 && cp <= 0x303e || cp >= 0x3041 && cp <= 0x33ff || cp >= 0x3400 && cp <= 0x4dbf || cp >= 0x4e00 && cp <= 0x9fff || cp >= 0xa000 && cp <= 0xa4cf || cp >= 0xac00 && cp <= 0xd7a3 || cp >= 0xf900 && cp <= 0xfaff || cp >= 0xfe30 && cp <= 0xfe4f || cp >= 0xff00 && cp <= 0xff60 || cp >= 0xffe0 && cp <= 0xffe6 || cp >= 0x20000 && cp <= 0x3fffd;
}
function unitLength(grapheme, measure) {
    return measure === "display-width" && isWide(grapheme) ? 2 : 1;
}
export function measureTitle(value, measure = "graphemes") {
    let total = 0;
    for (const g of graphemes(value))total += unitLength(g, measure);
    return total;
}
function cleanPart(value, field) {
    if (typeof value !== "string") fail("INVALID_REQUEST", `${field} must be a string`);
    const text = normalizeText(value);
    if (FORBIDDEN.test(text)) {
        fail("INVALID_REQUEST", `${field} contains control or bidirectional override characters`, {
            field
        });
    }
    return text;
}
export function cleanTopic(topic) {
    const text = cleanPart(topic, "topic");
    if (!text) fail("INVALID_TOPIC", "topic must not be empty");
    if (!/[\p{L}\p{N}]/u.test(text)) fail("INVALID_TOPIC", "topic must contain a letter or digit", {
        topic: text
    });
    if (text.includes(TOPIC_SEPARATOR.trim())) {
        fail("INVALID_TOPIC", `topic must not contain the separator "${TOPIC_SEPARATOR.trim()}"`, {
            topic: text
        });
    }
    if (hasPhaseMarker(text)) {
        fail("INVALID_TOPIC", "topic must not contain a phase marker (фаза/phase/этап/stage + number)", {
            topic: text
        });
    }
    return text;
}
export function layoutTitle(input) {
    const topic = cleanTopic(input.topic);
    const locale = input.locale ?? "en";
    if (locale !== "ru" && locale !== "en") fail("INVALID_REQUEST", "locale must be ru or en");
    const measure = input.measure ?? "graphemes";
    if (measure !== "graphemes" && measure !== "display-width") {
        fail("INVALID_REQUEST", "measure must be graphemes or display-width");
    }
    const maxLength = input.maxLength ?? DEFAULT_MAX_LENGTH;
    if (!Number.isInteger(maxLength) || maxLength < MIN_MAX_LENGTH || maxLength > MAX_MAX_LENGTH) {
        fail("INVALID_REQUEST", `maxLength must be an integer in ${MIN_MAX_LENGTH}..${MAX_MAX_LENGTH}`);
    }
    const phase = input.phase ?? null;
    if (phase !== null && (!Number.isInteger(phase) || phase < 1 || phase > MAX_PHASE)) {
        fail("INVALID_REQUEST", `phase must be an integer in 1..${MAX_PHASE}`);
    }
    const focusText = input.focus == null ? "" : cleanPart(input.focus, "focus");
    const focus = focusText || null;
    const head = phase === null ? topic : `${topic}${TOPIC_SEPARATOR}${PHASE_WORD[locale]} ${phase}`;
    const separator = phase === null ? TOPIC_SEPARATOR : FOCUS_SEPARATOR;
    const headLength = measureTitle(head, measure);
    const result = (title, focusTruncated, focusDropped)=>{
        assertRoundTrip(title, topic, phase);
        return {
            title,
            length: measureTitle(title, measure),
            maxLength,
            measure,
            focusTruncated,
            focusDropped
        };
    };
    if (input.requireFullFocus) {
        if (focus === null) fail("INVALID_REQUEST", "automatic naming requires a non-empty focus");
        const focusBudget = Math.max(0, maxLength - headLength - measureTitle(separator, measure));
        if (measureTitle(head + separator + focus, measure) > maxLength) {
            fail("TITLE_TOO_LONG", `The full title must fit ${maxLength} ${measure}. Focus has room for ${focusBudget}. Rephrase it without losing the key detail.`, {
                maxLength,
                measure,
                focusBudget
            });
        }
        return result(head + separator + focus, false, false);
    }
    if (headLength > maxLength) {
        fail("TITLE_TOO_LONG", "topic and phase marker alone exceed maxLength; they are never shortened", {
            required: headLength,
            maxLength,
            measure
        });
    }
    if (focus === null) {
        if (phase === null) fail("INVALID_REQUEST", "an unnumbered (subtask) title requires a non-empty focus");
        return result(head, false, false);
    }
    const full = head + separator + focus;
    if (measureTitle(full, measure) <= maxLength) return result(full, false, false);
    const budget = maxLength - headLength - measureTitle(separator, measure) - measureTitle(ELLIPSIS, measure);
    let used = 0;
    let cut = "";
    for (const g of graphemes(focus)){
        const w = unitLength(g, measure);
        if (used + w > budget) break;
        used += w;
        cut += g;
    }
    cut = cut.replace(/[\s·•|—–:,;\-]+$/u, "");
    if (cut) return result(head + separator + cut + ELLIPSIS, true, false);
    if (phase === null) {
        fail("TITLE_TOO_LONG", "no room for any focus in an unnumbered title", {
            required: headLength + measureTitle(separator, measure) + 2,
            maxLength,
            measure
        });
    }
    return result(head, false, true);
}
export function formatTitle(input) {
    return layoutTitle(input).title;
}
function assertRoundTrip(title, topic, phase) {
    const parsed = parseTitle(title, {
        knownTopic: topic
    });
    const ok = phase === null ? parsed.kind === "unnumbered" && parsed.topic === topic : parsed.kind === "phase" && parsed.topic === topic && parsed.phase === phase;
    if (!ok) {
        fail("INVALID_TOPIC", "topic/focus would produce a title that does not parse back unambiguously", {
            topic,
            title
        });
    }
}
const PHASE_WORDS = "фаза|phase|этап|stage";
const MARKER_SCAN = new RegExp(`(?<![\\p{L}\\p{N}_])(${PHASE_WORDS})\\s*[№#]?\\s*(\\d{1,6})(?!\\d)`, "giu");
const MARKER_ANY = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${PHASE_WORDS})\\s*[№#]?\\s*\\d`, "iu");
const STRONG_SEP_END = /(?:\s*[·•|—–]\s*|\s+[-/]\s+|\s*:\s+)$/u;
const WEAK_SEP_END = /\s+$/u;
const AFTER_NUMBER = /^(?:$|[\s·•|—–:/-])/u;
const FOCUS_LEAD = /^\s*(?:[·•|—–:]|[-/](?=\s))?\s*/u;
const UNNUMBERED_SEPARATORS = [
    " · ",
    " • ",
    " | "
];
export function hasPhaseMarker(text) {
    return MARKER_ANY.test(text);
}
function findMarkers(s) {
    const out = [];
    for (const m of s.matchAll(MARKER_SCAN)){
        const index = m.index ?? 0;
        const end = index + m[0].length;
        if (index === 0 || !AFTER_NUMBER.test(s.slice(end))) continue;
        const prefix = s.slice(0, index);
        const strong = STRONG_SEP_END.exec(prefix);
        const sep = strong ?? WEAK_SEP_END.exec(prefix);
        if (!sep) continue;
        const topic = prefix.slice(0, prefix.length - sep[0].length).trim();
        if (!/[\p{L}\p{N}]/u.test(topic)) continue;
        out.push({
            end,
            word: m[1].toLowerCase(),
            phase: Number(m[2]),
            strong: strong !== null,
            topic
        });
    }
    return out;
}
function markerParts(s, m) {
    const locale = m.word === "фаза" || m.word === "этап" ? "ru" : "en";
    const focus = s.slice(m.end).replace(FOCUS_LEAD, "").trim() || null;
    return {
        topic: m.topic,
        phase: m.phase,
        focus,
        locale
    };
}
function parseUnnumbered(s, knownTopic) {
    if (knownTopic !== undefined) {
        const known = normalizeText(knownTopic);
        for (const sep of UNNUMBERED_SEPARATORS){
            if (s.startsWith(known + sep) && s.length > known.length + sep.length) {
                const focus = s.slice(known.length + sep.length).trim();
                return {
                    kind: "unnumbered",
                    topic: known,
                    focus,
                    canonical: sep === TOPIC_SEPARATOR,
                    topicConfirmed: true
                };
            }
        }
        return null;
    }
    for (const sep of UNNUMBERED_SEPARATORS){
        const at = s.indexOf(sep);
        if (at > 0) {
            const topic = s.slice(0, at).trim();
            const focus = s.slice(at + sep.length).trim();
            if (topic && focus && /[\p{L}\p{N}]/u.test(topic)) {
                return {
                    kind: "unnumbered",
                    topic,
                    focus,
                    canonical: sep === TOPIC_SEPARATOR,
                    topicConfirmed: false
                };
            }
        }
    }
    return null;
}
export function parseTitle(title, options = {}) {
    if (title == null) return {
        kind: "empty"
    };
    const s = normalizeText(String(title));
    if (!s) return {
        kind: "empty"
    };
    const markers = findMarkers(s);
    const strong = markers.find((m)=>m.strong);
    if (strong) {
        if (strong.phase < 1) return {
            kind: "ambiguous",
            reason: "phase-zero"
        };
        if (hasPhaseMarker(strong.topic)) return {
            kind: "ambiguous",
            reason: "multiple-phase-markers"
        };
        const p = markerParts(s, strong);
        const canonicalText = `${p.topic}${TOPIC_SEPARATOR}${PHASE_WORD[p.locale]} ${p.phase}` + (p.focus ? `${FOCUS_SEPARATOR}${p.focus}` : "");
        return {
            kind: "phase",
            ...p,
            canonical: canonicalText === s
        };
    }
    const unnumbered = parseUnnumbered(s, options.knownTopic);
    if (unnumbered) return unnumbered;
    if (options.knownTopic !== undefined) return {
        kind: "unstructured"
    };
    const weak = markers[0];
    if (weak) {
        if (weak.phase < 1 || hasPhaseMarker(weak.topic)) return {
            kind: "ambiguous",
            reason: "multiple-phase-markers"
        };
        return {
            kind: "ambiguous",
            reason: "weak-phase-marker",
            candidate: markerParts(s, weak)
        };
    }
    return {
        kind: "unstructured"
    };
}
