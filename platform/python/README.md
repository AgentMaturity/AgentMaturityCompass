# AMC Python SDK

> **Scope: the TypeScript core is canonical.**
>
> This is a parallel Python implementation of AMC's shield/enforce/vault/watch/
> score/product areas — roughly 200 modules that share no code with `src/`. It
> ships in no published package (the npm `files` list excludes it) and nothing
> in the TypeScript core calls it.
>
> The two have already drifted: `src/score` carries 100+ scoring modules against
> 8 here. Treat this as a demonstration port for embedding AMC concepts in a
> Python service, not as a second supported product, and check behaviour against
> the TypeScript implementation when the two disagree.

