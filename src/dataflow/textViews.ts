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

/** Characters that render as nothing: zero-width space, joiners, word joiner, soft hyphen, Mongolian vowel separator, BOM. */
const ZERO_WIDTH_SOURCE = "\\u00ad\\u180e\\u200b-\\u200d\\u2060\\ufeff";
const ZERO_WIDTH = new RegExp(`[${ZERO_WIDTH_SOURCE}]`, "g");
/** One character's NFKC form where it is no longer than the character (`４` is `4`), else the character as it is. */
const foldChar = (char: string) => { const folded = char.normalize("NFKC"); return folded.length <= char.length ? folded : char; };
/**
 * Text as it reads: NFKC (fullwidth `４１１１` is `4111`, `ﬁ` is `fi`) with zero-width characters removed, so a card number
 * split by them or typed in fullwidth digits is seen. ASCII text is returned as it is. NFKC can lengthen text (U+FDFA is
 * 18 characters): where it would pass `maxChars`, each character is folded only where that does not lengthen it, so the
 * fold never makes a text the walk accepted too long to read.
 */
export const foldText = (text: string, maxChars = Number.POSITIVE_INFINITY) => {
  if (!/[^\u0000-\u007f]/.test(text)) return text;
  const nfkc = text.normalize("NFKC");
  return (nfkc.length <= Math.max(maxChars, text.length) ? nfkc : text.replace(/[^\u0000-\u007f]/gu, foldChar)).replace(ZERO_WIDTH, "");
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
/** What a member-name pattern accepts beside ASCII name characters, so `pаssword=` (Cyrillic а) reaches `foldName`. */
export const NAME_FOLD_CHARS = Object.keys(CONFUSABLES).join("") + ZERO_WIDTH_SOURCE;
/** A member name as it reads (`foldText`), its look-alike letters folded to Latin: `pаssword` and `ｐａｓｓｗｏｒｄ` are `password`. */
export const foldName = (name: string) => foldText(name).replace(CONFUSABLE, letter => CONFUSABLES[letter]!);
