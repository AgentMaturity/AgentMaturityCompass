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

/** Characters that render as nothing or only steer layout: every default-ignorable code point and format (Cf) character. */
const IGNORABLE = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/gu;
/**
 * Text as it reads: NFKC (fullwidth `４１１１` is `4111`, `ﬁ` is `fi`, `㎩` is `Pa`) with ignorable and format characters
 * removed (zero-width space, U+200E, U+2062, a variation selector), so a card number split by them or typed in fullwidth
 * digits is seen. ASCII text is returned as it is. NFKC can lengthen text (U+FDFA is 18 characters); the whole text is
 * always folded, never part of it, and the walk charges a folded view's length to its request budget.
 */
export const foldText = (text: string) => /[^\u0000-\u007f]/.test(text) ? text.normalize("NFKC").replace(IGNORABLE, "") : text;

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
const FOLDED_CHARS = new Map<string, string>();
/**
 * `text` with each code point folded as `foldName` folds it, and where each view character came from: view character `i`
 * was read from original characters `from[i]` to `to[i]`, so a match in the view maps back to the text. Undefined for
 * ASCII text, which folds to itself.
 */
export function foldedView(text: string): { readonly view: string; readonly from: readonly number[]; readonly to: readonly number[] } | undefined {
  if (!/[^\u0000-\u007f]/.test(text)) return undefined;
  const from: number[] = [], to: number[] = [], parts: string[] = [];
  for (let index = 0; index < text.length;) {
    const width = text.codePointAt(index)! > 0xffff ? 2 : 1, char = text.slice(index, index + width);
    let folded = char.charCodeAt(0) < 0x80 ? char : FOLDED_CHARS.get(char);
    if (folded === undefined) { folded = foldName(char); if (FOLDED_CHARS.size < 65_536) FOLDED_CHARS.set(char, folded); }
    for (let offset = 0; offset < folded.length; offset += 1) { from.push(index); to.push(index + width); }
    parts.push(folded);
    index += width;
  }
  return { view: parts.join(""), from, to };
}
