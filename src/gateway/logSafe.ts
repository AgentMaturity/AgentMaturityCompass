/**
 * Log text without URL queries (LIVE-RUNTIME-11): some providers take the API key as a query parameter, and an error
 * message can carry the URL it failed on. Only the `?...` part of each URL goes; the scheme, host and path stay.
 */
export function withoutUrlQueries(text: string): string {
  return text.replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#"'<>]*)\?[^\s#"'<>]*/gi, "$1");
}
