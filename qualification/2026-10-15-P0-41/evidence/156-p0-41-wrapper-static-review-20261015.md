# P0-41 wrapper static review

No blocking static findings were found in the prepared wrapper. This review grants no runtime authorization and closes no formal acceptance criterion.

The complete 10,488-byte wrapper was read and compared with the reviewed P0-11 predecessor. The exact derivation changes only the P0-41 docstring, repository path, private base path, journal path and terminal diagnostic. Argument handling, reporter binding, environment behavior, process lifecycle and deadlines are unchanged.

The observed-command path requires pinned Node 22, the assigned repository's Vitest entry point, both the frozen observer and JSON reporters, and one fresh absolute JSON producer path within the private base. The reporter remains the 2,110-byte P0-21 observer with SHA-256 `4eddb7dd8e92bd4522c4b6a763f84630105dfc008efae6429786ccd2a229f447`; its legacy environment key is intentionally retained.

Commands start in a new session with exclusive metadata, stream and active-marker files. Normal waiting is unbounded. The wrapper sends no terminating signals, retries no command and performs no restoration. After exit it polls only its owned process group with signal 0 for at most five seconds, retaining observations and requiring positive ESRCH before accepting completion. A remaining group or other uncertainty retains ACTIVE and records HALTED.

An observed result is copied byte-for-byte to a fresh exclusive snapshot only after normal process exit and owned-group absence. The observer PID and working directory are checked. Git HEAD must be unchanged. These checks establish metadata boundaries; they do not establish complete file preservation or test acceptance. Exit 1 can be a legitimate recorded negative result. Case counts, body errors, hooks, known late-close banners and teardown attribution require the later actual evidence audit.

The wrapper inherits `os.environ`, then scopes Node 22 PATH, private HOME, no-lazy-fetch and the observer output key. It does not implement the later causal seven-key environment. This review makes no claim about credentials, transport isolation, cache writes, native ABI observations or the new P0-41 fixture's artifact environment. Run-end observation precedes global teardown. Owned-group ESRCH does not exclude every detached descendant. An unbounded command can remain incomplete indefinitely.

No wrapper, reporter or product code was imported, parsed, syntax-checked or executed. No fixture, private runtime base, repository file or Git state was created or changed. Only this review pair was written. All review reads are finished.
