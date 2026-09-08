/**
 * The credentials seam as a composed service (P3.0).
 *
 * `ctx.amcCredentials` is what P3.1's LLM adapters will inject rather than
 * importing a store, for the same reason the evidence spine became injectable
 * in P2.1: a consumer that declares `inject: ["amcCredentials"]` stays PENDING
 * when no provider is composed, instead of quietly reading `process.env` and
 * behaving as though a credential source had been configured.
 *
 * Unlike the evidence facades, this one holds a live resource. The local store
 * owns a file watcher and a serialised write queue, so the fiber's disposer has
 * to close it — a store that outlived its fiber would keep publishing file
 * changes into a service nobody can reach, and would hold the watch descriptor
 * for the life of the process.
 *
 * This module lives under src/kernel/ because it imports workspace packages the
 * published npm tarball does not contain; the architecture-boundaries gate
 * enforces that placement.
 */
import { AmcSeam, defineSeam } from "../amcRuntime.js";
import type { Context } from "../amcRuntime.js";
import type { CredentialRef } from "../../credentials/credentialRef.js";
import type { CredentialDescription } from "../../credentials/credentialSources.js";
import type { CredentialsService } from "../../credentials/credentialsService.js";
import type { CredentialsPaths } from "../../credentials/credentialsPaths.js";
import {
  LocalCredentialsService,
  type LocalCredentialsOptions
} from "../../credentials/localCredentialsService.js";

export const CREDENTIALS_SEAM = defineSeam("amcCredentials");

/**
 * How the composed store is pointed at disk.
 *
 * Identical to the store's own options rather than a reduced subset: a
 * composition that cannot say where the credentials file lives cannot run two
 * isolated tenants on one host, and inventing a narrower vocabulary here would
 * mean two path-resolution stories instead of one.
 */
export type CredentialsServiceConfig = LocalCredentialsOptions;

/**
 * The layered credential store, on the tree.
 *
 * Delegation, not reimplementation. Every rule that matters — precedence,
 * empty-is-absent, shadowed-write rejection, permission assertions, the
 * never-a-value-in-describe guarantee — has exactly one implementation, in
 * src/credentials/, and this class must not acquire a second one. In
 * particular there is no caching layer here: `resolve` is a delegation on every
 * call because per-operation re-resolution is the property the whole seam
 * exists to provide, and a cache in the facade would silently remove it.
 */
export class CredentialsSeamService extends AmcSeam implements CredentialsService {
  private readonly store: LocalCredentialsService;

  constructor(ctx: Context, config: CredentialsServiceConfig = {}) {
    super(ctx, CREDENTIALS_SEAM.name);
    // Constructing the store *is* booting it: a group-readable file or
    // unparsable YAML throws here, which fails the fiber. That is the intent —
    // a provider that registered and then had no credentials would be
    // indistinguishable, to every consumer, from a correctly configured store
    // on a machine where nothing is set.
    this.store = new LocalCredentialsService(config);
    // Async disposer: cordis awaits it, so the fiber does not report itself
    // unloaded while a queued write is still holding the cross-process lock.
    this.ctx.effect(
      () => async () => {
        await this.store.close();
      },
      "amcCredentials store"
    );
  }

  resolve(ref: CredentialRef): string | null {
    return this.store.resolve(ref);
  }

  describe(ref: CredentialRef): CredentialDescription {
    return this.store.describe(ref);
  }

  set(ref: CredentialRef, value: string): Promise<void> {
    return this.store.set(ref, value);
  }

  unset(ref: CredentialRef): Promise<boolean> {
    return this.store.unset(ref);
  }

  /** Operator-facing enumeration; see the note on the store's own `names`. */
  names(): readonly CredentialRef[] {
    return this.store.names();
  }

  /** Where the layers live — paths only, so it is safe to render. */
  get paths(): CredentialsPaths {
    return this.store.paths;
  }

  /** Whether external edits are observed, or a `reload()` is required. */
  get watching(): boolean {
    return this.store.watching;
  }

  /**
   * Re-reads the file-backed layers now.
   *
   * Exposed because `watching` can be false — a read-only home, a filesystem
   * without change notification — and a composition that cannot ask for a
   * reload would have no way to pick up a rotation on those hosts at all.
   */
  reload(): void {
    this.store.reload();
  }
}

/**
 * Registers the credentials provider.
 *
 * A single-service plugin rather than a group: unlike the evidence spine, whose
 * four halves are useless apart, this seam is complete on its own and later
 * phases attach to it individually.
 */
export const credentialsServices = {
  name: "amc-credentials-services",
  apply(ctx: Context, config: CredentialsServiceConfig = {}): void {
    ctx.plugin(CredentialsSeamService, config);
  }
};
