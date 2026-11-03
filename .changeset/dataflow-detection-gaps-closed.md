---
"agent-maturity-compass": patch
---

Protected-data detection now reads each line NFKC-normalised with zero-width characters removed, so a card number in fullwidth digits or split by zero-width characters is detected and its line replaced; member names are folded the same way and their Cyrillic and Greek look-alike letters read as Latin (`pаssword`); an XML element's text (a CDATA section in it included), an HTML input's quoted `value` under its `name`, and a Basic authorization scheme's base64 `user:password` in free text are read as credentials, while ordinary XML, HTML forms and prose such as "Basic Settings" are left as they are. A line that NFKC would lengthen past the walk's length limit is folded character by character instead, so a benign line is never refused for its fold. The detector set digest changes with these rules.
