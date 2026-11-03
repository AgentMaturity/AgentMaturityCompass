/** How the protected-data walk (detectors.ts) reads text and member names the way a person or a server would. */

export const NAMED_REFERENCES: Readonly<Record<string, string>> = Object.freeze({ amp: "&", commat: "@", period: ".", plus: "+",
  num: "#", colon: ":", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " });
export const WEB_ESCAPE = /(?:%[0-9A-Fa-f]{2})+|(?<=[A-Za-z0-9])\+(?=[A-Za-z0-9])|&(?:#(\d{1,7})|#[xX]([0-9A-Fa-f]{1,6})|([A-Za-z]{2,6}));/g;
/**
 * Percent-encoding (a form's `+` between letters or digits as a space) and HTML character references, decoded in one
 * linear pass, as a server or browser reads a URL, a form post or a page: `alice%40example.com`, `4111+1111+1111+1111`,
 * `alice&#64;example.com`. A %-run that is not UTF-8 decodes byte by byte; an unknown reference stays as it is.
 */
export const decodeWebEscapes = (text: string) => text.replace(WEB_ESCAPE,
  (match: string, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (match === "+") return " ";
    if (match.startsWith("%")) {
      try { return decodeURIComponent(match); } catch { return match.replace(/%([0-9A-Fa-f]{2})/g, (_byte, code: string) => String.fromCharCode(Number.parseInt(code, 16))); }
    }
    if (name !== undefined) return Object.hasOwn(NAMED_REFERENCES, name.toLowerCase()) ? NAMED_REFERENCES[name.toLowerCase()]! : match;
    const code = decimal !== undefined ? Number.parseInt(decimal, 10) : Number.parseInt(hex!, 16);
    return code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });

const JSON_ESCAPES: Readonly<Record<string, string>> = Object.freeze({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" });
// JSON string escapes (\n, \uXXXX, \" ...) decoded in one linear pass, so escaped text in malformed arguments still matches.
export const decodeJsonEscapes = (text: string) => !text.includes("\\") ? text : text.replace(/\\(?:u([0-9a-fA-F]{4})|([\s\S]))/g,
  (_match, hex: string | undefined, char: string) => hex !== undefined ? String.fromCharCode(Number.parseInt(hex, 16))
    : Object.hasOwn(JSON_ESCAPES, char) ? JSON_ESCAPES[char]! : char);
export const BASE64_RUN = /[A-Za-z0-9+/_-]{24,}={0,2}/g;
export const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true });
/**
 * What a run of 24 or more base64 or base64url characters decodes to, where that is UTF-8 text with at most one control
 * character in ten (an encoded mail body, a text resource blob, a Secret's `data`); undefined for other runs (hashes,
 * random tokens, binary). The text is always shorter than the run.
 */
export const decodeBase64Run = (run: string): string | undefined => {
  const body = run.replace(/=+$/, "");
  if (body.length % 4 === 1) return undefined;
  let decoded: string;
  try { decoded = STRICT_UTF8.decode(Buffer.from(body, "base64")); } catch { return undefined; }
  return decoded.length > 0 && (decoded.match(CONTROL_CHARS)?.length ?? 0) * 10 <= decoded.length ? decoded : undefined;
};
/** Whether bytes are UTF-8 text without control characters (a Basic token of letters only must be). */
export const readableText = (bytes: Buffer) => { try { return !/[\u0000-\u001f\u007f-\u009f]/.test(STRICT_UTF8.decode(bytes)); } catch { return false; } };
/** Characters that render as nothing or only steer layout: every default-ignorable code point and format (Cf) character. */
const IGNORABLE = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/gu;
/**
 * The longest a fold may be, from the length of its text: four times it plus 1 MiB (60,000 copies of U+FDFA, a squared
 * unit such as U+337F on every character, a ligature line), and never more than 16 MiB longer than the text, so long text
 * that hardly grows always folds. A fold past it is not built.
 */
export const FOLD_GROWTH = 4, FOLD_SLACK = 1_048_576, FOLD_MAX_CHARS = 16_777_216;
export const foldLimit = (length: number) => length + Math.min((FOLD_GROWTH - 1) * length + FOLD_SLACK, FOLD_MAX_CHARS);
/** A fold that would pass its limit: callers fail closed (refuse the request, replace the line or the whole text). */
export class FoldOverflow extends Error {
  constructor() { super("Folded text would pass its length limit"); this.name = "FoldOverflow"; }
}
const NFKD_LENGTHS = new Map<string, number>();
/**
 * Whether NFKC of `text` is at most `limit` characters, before building it: each code point's NFKD length summed (the NFKC
 * of a whole text is never longer than the NFKD of its characters), stopping once past the limit.
 */
function foldFits(text: string, limit: number): boolean {
  let total = 0;
  for (let index = 0; index < text.length && total <= limit;) {
    const width = text.codePointAt(index)! > 0xffff ? 2 : 1;
    if (text.charCodeAt(index) < 0x80) { total += 1; index += 1; continue; }
    const char = text.slice(index, index + width);
    let length = NFKD_LENGTHS.get(char);
    if (length === undefined) { length = char.normalize("NFKD").length; if (NFKD_LENGTHS.size < 65_536) NFKD_LENGTHS.set(char, length); }
    total += length;
    index += width;
  }
  return total <= limit;
}
/**
 * Text as it reads: NFKC (fullwidth `４１１１` is `4111`, `ﬁ` is `fi`, `㎩` is `Pa`) with ignorable and format characters
 * removed (zero-width space, U+200E, U+2062, a variation selector), so a card number split by them or typed in fullwidth
 * digits is seen. ASCII text is returned as it is. NFKC can lengthen text (U+FDFA is 18 characters); the whole text is
 * always folded, never part of it, and a fold that could pass `limit` (`foldLimit`) throws `FoldOverflow` before it is built.
 */
export const foldText = (text: string, limit = foldLimit(text.length)) => {
  if (!/[^\u0000-\u007f]/.test(text)) return text;
  if (!foldFits(text, limit)) throw new FoldOverflow();
  return text.normalize("NFKC").replace(IGNORABLE, "");
};

/** Cyrillic and Greek letters drawn like a Latin one, folded in member names only: prose in those scripts is left as it is. */
const CONFUSABLES: Readonly<Record<string, string>> = Object.freeze({
  "а": "a", "в": "b", "е": "e", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p", "с": "c", "т": "t", "у": "y", "х": "x",
  "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "ԛ": "q", "ԝ": "w", "һ": "h", "ӏ": "l",
  "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T", "У": "Y", "Х": "X",
  "І": "I", "Ј": "J", "Ѕ": "S",
  "α": "a", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p", "τ": "t", "υ": "u", "χ": "x",
  "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T",
  "Υ": "Y", "Χ": "X"
});
const CONFUSABLE = new RegExp(`[${Object.keys(CONFUSABLES).join("")}]`, "g");
/**
 * One member-name character in a pattern: an ASCII name character or any non-ASCII character but a space, so a name with
 * look-alike, fullwidth, mathematical or ignorable characters (`pаssword`, `ｐａｓｓｗｏｒｄ`, `pass\u200eword`) reaches
 * `foldName`, which decides what it reads as. An astral character counts as two.
 */
export const NAME_CHAR = "[^\\u0000-\\u002c\\u002f\\u003a-\\u0040\\u005b-\\u005e\\u0060\\u007b-\\u007f\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";
/** A member name as it reads (`foldText`), its look-alike letters folded to Latin: `pаssword` and `ｐａｓｓｗｏｒｄ` are `password`. */
export const foldName = (name: string) => foldText(name).replace(CONFUSABLE, letter => CONFUSABLES[letter]!);
const FOLDED_CODE_POINTS = new Map<number, string>();
const foldCodePoint = (code: number) => {
  let folded = FOLDED_CODE_POINTS.get(code);
  if (folded === undefined) { folded = foldName(String.fromCodePoint(code)); if (FOLDED_CODE_POINTS.size < 65_536) FOLDED_CODE_POINTS.set(code, folded); }
  return folded;
};
/**
 * `text` with each code point folded as `foldName` folds it, and where each view character came from: view character `i`
 * was read from the code point at original offset `from[i]`, so a match in the view maps back to the text. Undefined for
 * ASCII text, which folds to itself. The view's length is measured first; past `foldLimit` it throws `FoldOverflow`, so
 * neither the view nor its offsets are built. ASCII is copied as it is and only non-ASCII code points are folded, into one
 * array of UTF-16 units turned into the view in blocks, so no string or array entry is made per character.
 */
export function foldedView(text: string): { readonly view: string; readonly from: Int32Array } | undefined {
  if (!/[^\u0000-\u007f]/.test(text)) return undefined;
  const limit = foldLimit(text.length);
  let length = 0, run = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) < 0x80) continue;
    const code = text.codePointAt(index)!;
    length += index - run + foldCodePoint(code).length;
    if (length > limit) throw new FoldOverflow();
    if (code > 0xffff) index += 1;
    run = index + 1;
  }
  length += text.length - run;
  if (length > limit) throw new FoldOverflow();
  const units = new Uint16Array(length), from = new Int32Array(length);
  for (let index = 0, at = 0; index < text.length;) {
    const unit = text.charCodeAt(index);
    if (unit < 0x80) { units[at] = unit; from[at++] = index++; continue; }
    const code = text.codePointAt(index)!, folded = foldCodePoint(code);
    for (let offset = 0; offset < folded.length; offset += 1) { units[at] = folded.charCodeAt(offset); from[at++] = index; }
    index += code > 0xffff ? 2 : 1;
  }
  let view = "";
  for (let start = 0; start < length; start += 8_192) view += String.fromCharCode(...units.subarray(start, start + 8_192));
  return { view, from };
}
