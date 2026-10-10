/**
 * `ctx.llm` — the one path from a model request to a model response.
 *
 * THE SHAPE OF A CALL, AND WHY IT IS THIS SHAPE.
 *
 *   pin the route  →  log the request  →  resolve the credential  →  dispatch
 *                  →  stream and fold  →  log the settlement
 *
 * Each arrow is a place a naive implementation would ask the world again, and
 * each of those questions has a different answer under hot module replacement,
 * credential rotation, or a config edit. So the answers are taken ONCE and
 * carried:
 *
 *   - The ROUTE is pinned before anything durable exists. A replaced or removed
 *     adapter registration cannot reach a call that already pinned, so a header
 *     row and its settlement row always name the same adapter build.
 *   - The BYTES are minted by `prepareRequest`, which cannot produce them
 *     without first committing a signed `request/header` row naming their
 *     digest. The adapter receives them and may not rewrite them.
 *   - The CREDENTIAL is deliberately NOT pinned. It is resolved at dispatch,
 *     per request, through the P3.0 seam — that is the whole point of the seam,
 *     and hoisting it would restore the restart-to-rotate behaviour it exists to
 *     remove. It is the one thing here that must be late-bound.
 *
 * WHY THE RUNTIME RESOLVES THE CREDENTIAL AND NOT THE ADAPTER. Because "resolve
 * per request through the seam, never from `process.env`" is a rule, and the way
 * to enforce a rule is to leave the adapter no opportunity to break it: the
 * value arrives as an argument, so an adapter has nothing to read and nothing to
 * cache. The value is also never returned, never logged and never recorded — it
 * is handed to the envelope builder and to the credential guard, and nothing
 * else in this module holds it after the dispatch returns.
 *
 * WHAT A FAILURE DOES. It becomes a typed {@link LlmError} thrown from the
 * iterator AND a signed `request/failure` row, in that order of importance and
 * the opposite order of operations: the row is written first, so a consumer that
 * swallows the throw cannot make the failure disappear from the log. A 429 is
 * the worked example — it is refused before a single chunk is produced, and the
 * row records both the provider's facts and the retry verdict the route's frozen
 * policy reached.
 */
import { resolve } from "node:path";
import type { CredentialsService } from "../../credentials/credentialsService.js";
import { credentialRefName } from "../../credentials/credentialRef.js";
import type { RecordedCredential } from "../../session/requestOutcomeMeta.js";
import type { PreparedRequest, SessionService } from "../../session/sessionService.js";
import { LLM_FAILURE_CODE, LlmError, isLlmError, normalizeLlmFailure } from "../llmFailure.js";
import type { LlmFailure } from "../llmFailure.js";
import { isLlmStreamProtocolError } from "../streamProtocol.js";
import type { StreamChunk } from "../streamChunk.js";
import { prepareRequest } from "../request/prepareRequest.js";
import type { RequestEncoderRegistry } from "../request/requestEncoder.js";
import type { ToolSchema } from "../request/requestSpec.js";
import type { AdapterRegistry, PinnedRoute } from "./adapterRegistry.js";
import { classifyResponseFailure } from "./responseFailure.js";
import { StreamRecorder } from "./streamRecorder.js";
import type { SettledStream } from "./streamRecorder.js";
import { fetchTransport, readBodyText } from "./transport.js";
import type { HttpResponse, HttpTransport } from "./transport.js";
import { assertRequestCapabilities, assertRequiredCapabilities, LlmCapabilityError } from "./providerCapabilities.js";
import { LiveTextPreview, type LiveTextPreviewEvent } from "./liveTextPreview.js";
import { reserveNativeModelBudget } from "../../budgets/nativeBudgetAdmission.js";
import { BudgetEvidenceIntegrityError } from "../../budgets/nativeBudgetUsage.js";
import { bindProviderToolNames, usesProviderToolNames } from "../request/providerToolNames.js";
import { ProviderToolBinding } from "./providerToolBinding.js";
import { checkEgress, EgressBlocked } from "../../residency/checkEgress.js";
import { detectProtectedRequest } from "../../dataflow/detectors.js";
import { admitProtectedModelRequest, DataFlowRefused } from "../../dataflow/purposePolicy.js";
import { loadProcessorRegistrySnapshot } from "../../dataflow/processorRegistry.js";

/** One model call, as a caller describes it. */
export interface LlmCallSpec {
  /** Requirements checked locally, not serialized into provider params. */
  readonly requiredCapabilities?: readonly string[];
  readonly requiredProtocol?: string;
  readonly providerId: string;
  readonly model: string;
  /** Provider parameters (max_tokens, temperature, …), verbatim into the body. */
  readonly params: Record<string, unknown>;
  /** The `system/prompt` event whose payload is this request's system text. */
  readonly systemPromptEventId: string;
  /** Tools to offer, or null. Committed to the log before the header is written. */
  readonly tools: readonly ToolSchema[] | null;
  readonly signal?: AbortSignal;
}

/** How the runtime is wired. */
export interface LlmRuntimeInit {
  readonly session: SessionService;
  readonly credentials: CredentialsService;
  readonly registry: AdapterRegistry;
  /** Defaults to the platform `fetch`; a stub upstream replaces it in tests. */
  readonly transport?: HttpTransport;
  readonly encoders?: RequestEncoderRegistry;
  readonly now?: () => number;
  readonly onLiveText?: (event: LiveTextPreviewEvent) => void;
}

/** Thrown when a call cannot be prepared or dispatched twice. */
export class LlmDispatchError extends Error {
  readonly code: "AMC_LLM_CALL_ALREADY_DISPATCHED";

  constructor(message: string) {
    super(message);
    this.name = "LlmDispatchError";
    this.code = "AMC_LLM_CALL_ALREADY_DISPATCHED";
  }
}

/**
 * A call whose route is pinned and whose bytes are already logged and signed.
 *
 * Single-use by construction. A second dispatch would transmit the same bytes
 * under the same `request/header` commitment twice, so the log would record one
 * request where two were sent — and, worse, both settlements would claim to
 * settle the same header.
 */
export class PreparedCall {
  readonly route: PinnedRoute;

  readonly headerEventId: string;

  readonly requestDigest: string;

  private readonly runtime: LlmRuntime;

  private readonly prepared: PreparedRequest;

  private readonly spec: LlmCallSpec;

  private dispatched = false;

  private settlement: SettledStream | null = null;

  /** @internal — minted only by {@link LlmRuntime.prepare}. */
  constructor(runtime: LlmRuntime, route: PinnedRoute, prepared: PreparedRequest, spec: LlmCallSpec,
    private readonly toolNames: ReadonlyMap<string, string> | null = null) {
    this.runtime = runtime;
    this.route = route;
    this.prepared = prepared;
    this.headerEventId = prepared.headerEventId;
    this.requestDigest = prepared.requestDigest;
    this.spec = spec;
  }

  /**
   * How the dispatch settled, or null while it is still running.
   *
   * Exposed because the settlement is what a caller needs to record a step: the
   * assembly's blocks, its usage, and the id of the row that closed it. A caller
   * that wanted those by re-reading the log would have to find the row first.
   */
  get settled(): SettledStream | null {
    return this.settlement;
  }

  /** Dispatch and stream. Throws {@link LlmError} on any failed settlement. */
  stream(): AsyncIterable<StreamChunk> {
    if (this.dispatched) {
      throw new LlmDispatchError(
        `request ${this.headerEventId} was already dispatched; a prepared call sends exactly once`
      );
    }
    this.dispatched = true;
    return this.runtime.dispatch(this.route, this.prepared, this.spec, (settled) => {
      this.settlement = settled;
    }, this.toolNames);
  }
}

export class LlmRuntime {
  private readonly init: LlmRuntimeInit;

  private readonly transport: HttpTransport;

  private readonly workspace: string;

  private readonly now: () => number;

  constructor(init: LlmRuntimeInit) {
    this.init = init;
    this.transport = init.transport ?? fetchTransport;
    this.workspace = resolve(init.session.workspace);
    this.now = init.now ?? Date.now;
  }

  /** Which providers this runtime can reach right now. */
  providers(): readonly string[] {
    return this.init.registry.list();
  }

  /** Local protocol/capability discovery, never a claim of a live model probe. */
  describeProviders(): ReturnType<AdapterRegistry["describe"]> {
    return this.init.registry.describe();
  }

  /**
   * Pin the route and log the request, without sending it.
   *
   * Separated from {@link LlmRuntime.stream} because the agent loop (P3.2) needs
   * the split: it prepares a step's request, then decides — under cancellation,
   * under an approval — whether to dispatch it. The header row exists either
   * way, which is correct: AMC decided to ask the model that, and a request
   * prepared and abandoned is a fact worth having.
   */
  prepare(spec: LlmCallSpec): PreparedCall {
    const route = this.init.registry.pin({ providerId: spec.providerId, model: spec.model });
    assertRequiredCapabilities(route.capabilities, spec.requiredCapabilities);
    if (spec.requiredProtocol !== undefined && route.capabilities?.protocol !== spec.requiredProtocol) {
      throw new LlmCapabilityError("required-protocol", route.capabilities === null ? "unknown" : "unsupported");
    }
    // Before anything durable: an adapter that cannot carry these params says so
    // now, rather than after a signed header row commits to bytes it will refuse.
    route.adapter.assertParams?.(spec.params);
    // Capture authority before dispatch. Mutating caller-owned schemas after
    // prepare cannot change what this request permits the provider to name.
    const toolNames = usesProviderToolNames(route.encoderId, route.encoderVersion)
      ? bindProviderToolNames(spec.tools ?? []) : null;
    const prepared = prepareRequest(this.init.session, {
      model: spec.model,
      providerId: route.providerId,
      // The ENCODER comes from the pinned adapter, never from the caller: an
      // adapter transmits one wire shape, and letting a caller name a different
      // one is how a well-formed request of the wrong shape gets sent.
      encoderId: route.encoderId,
      encoderVersion: route.encoderVersion,
      params: spec.params,
      systemPromptEventId: spec.systemPromptEventId,
      tools: spec.tools,
      assertRequest: (request) => {
        assertRequestCapabilities(route.capabilities, request);
        // Opt-in: no .amc/dataflow/processors.yaml (and no .sig) means this workspace has not adopted protected-data admission.
        if (loadProcessorRegistrySnapshot(this.workspace).state === "missing") return;
        const detection = detectProtectedRequest(request);
        if (detection.classes.length === 0) return;
        const admission = admitProtectedModelRequest(this.workspace, route.providerId, route.baseUrl, detection);
        const evidence = {
          classes: [...detection.classes],
          counts: { ...detection.counts },
          detectorSetDigest: detection.detectorSetDigest,
          processorId: admission.processorId
        };
        try {
          this.init.session.recordProjectedEvidence({
            eventType: "audit",
            payload: JSON.stringify(evidence),
            meta: { auditType: "PROTECTED_DATA_DETECTED", ...evidence }
          });
        } catch {
          throw new DataFlowRefused("audit_failed");
        }
        if (!admission.allowed) throw new DataFlowRefused(admission.reason);
      },
      ...(this.init.encoders !== undefined ? { encoders: this.init.encoders } : {})
    });
    return new PreparedCall(this, route, prepared, spec, toolNames);
  }

  /** Prepare and dispatch in one call — the direct `ctx.llm.stream()` path. */
  stream(spec: LlmCallSpec): AsyncIterable<StreamChunk> {
    return this.prepare(spec).stream();
  }

  /**
   * The dispatch itself.
   *
   * An async generator, so nothing happens until the consumer pulls — which is
   * what makes a `PreparedCall` that is prepared and never streamed cost no
   * network at all.
   *
   * @internal — reached only through {@link PreparedCall.stream}.
   */
  async *dispatch(
    route: PinnedRoute,
    prepared: PreparedRequest,
    spec: LlmCallSpec,
    onSettled: (settled: SettledStream) => void,
    toolNames: ReadonlyMap<string, string> | null = null
  ): AsyncIterable<StreamChunk> {
    // Resolved HERE, per request, and never hoisted: a key rotated between two
    // steps of the same turn applies to the second one.
    const secret = route.credentialRef === null ? null : this.init.credentials.resolve(route.credentialRef);
    let dispatchAttempted = false;
    const recorder = new StreamRecorder({
      session: this.init.session,
      pinned: route,
      headerEventId: prepared.headerEventId,
      requestDigest: prepared.requestDigest,
      credential: this.describeCredential(route),
      secret,
      now: this.now,
      dispatchAttempted: () => dispatchAttempted
    });

    // Explicitly typed so TypeScript treats a call as a never-return and every
    // caller below is understood to terminate. `throw settle(...)` at each call
    // site states the same thing to a reader.
    const settle: (settled: SettledStream) => never = (settled) => {
      onSettled(settled);
      const failure = settled.failure;
      if (failure === null) {
        throw new Error("LlmRuntime.settle was reached with a successful settlement");
      }
      throw new LlmError(failure.message, failure.code, {
        ...(failure.status === undefined ? {} : { status: failure.status }),
        ...(failure.providerRetryAfterMs === undefined
          ? {}
          : { providerRetryAfterMs: failure.providerRetryAfterMs }),
        ...(failure.requestId === undefined ? {} : { requestId: failure.requestId })
      });
    };

    // A route that names a credential which no layer supplies fails BEFORE the
    // network, and still writes a row: "AMC could not call the model because the
    // key was missing" is an operational fact, and one an operator will look for
    // in the log rather than in a terminal that has scrolled.
    if (route.credentialRef !== null && secret === null) {
      throw settle(
        recorder.fail({
          failure: missingCredentialFailure(route),
          kind: "error",
          httpStatus: null,
          cause: "credential_missing"
        })
      );
    }

    const request = route.adapter.envelope({
      baseUrl: route.baseUrl,
      model: route.model,
      body: prepared.toBytes(),
      credential: secret,
      extraHeaders: route.headers,
      ...(spec.signal !== undefined ? { signal: spec.signal } : {})
    });

    if (spec.signal?.aborted) {
      throw settle(recorder.fail({ failure: { message: "request cancelled before budget admission", code: LLM_FAILURE_CODE.ABORTED }, kind: "aborted", httpStatus: null, cause: "aborted_before_dispatch" }));
    }
    try {
      reserveNativeModelBudget(this.init.session, prepared.headerEventId);
    } catch (error) {
      // Evidence that fails verification is not exhausted quota: label it so an operator checks the ledger, not the provider.
      const integrity = error instanceof BudgetEvidenceIntegrityError;
      throw settle(recorder.fail({ failure: { message: error instanceof Error ? error.message : "native budget admission failed", code: integrity ? "AMC_EVIDENCE_INTEGRITY" : LLM_FAILURE_CODE.QUOTA }, kind: "error", httpStatus: null, cause: integrity ? "budget_evidence_invalid" : "budget_refused" }));
    }

    let response: HttpResponse;
    try {
      // The same gate covers injected transports and fetch, before either can transmit the pinned bytes.
      checkEgress({ workspace: this.workspace, channel: "provider", url: request.url });
      dispatchAttempted = true;
      response = await this.transport({ ...request, redirect: "error" });
    } catch (error: unknown) {
      throw settle(recorder.fail(this.transportFailure(error, spec.signal)));
    }

    if (response.status < 200 || response.status >= 300) {
      const bodyText = await readBodyText(response.body);
      throw settle(
        recorder.fail({
          failure: classifyResponseFailure({ adapter: route.adapter, response, bodyText, now: this.now })
            .failure,
          kind: "error",
          httpStatus: response.status,
          cause: `http_${response.status}`
        })
      );
    }

    // One settlement per dispatch, and the flag is what enforces it across three
    // exits: a clean finish, a throw, and the consumer walking away mid-stream.
    let recorded = false;
    const preview = new LiveTextPreview({ sessionId: this.init.session.sessionId, headerEventId: prepared.headerEventId,
      secret, notify: this.init.onLiveText });
    const binding = toolNames === null ? null : new ProviderToolBinding(toolNames);
    try {
      for await (const decoded of route.adapter.decode(response)) {
        const chunk = binding?.bind(decoded) ?? decoded;
        // Folded and grammar-checked BEFORE the consumer sees it: a chunk that
        // breaks the contract must not reach a caller who might act on it.
        recorder.push(chunk);
        preview.push(chunk);
        yield chunk;
      }
      const settled = recorder.complete(response.status);
      recorded = true;
      // An in-band terminal error — the adapter decoded a provider error event
      // into `finish {kind: "error"}` — is a failure and surfaces as one. The
      // finish chunk has already been yielded, so a consumer that inspects it
      // sees the same facts the throw carries.
      if (settled.failure !== null) throw settle(settled);
      onSettled(settled);
    } catch (error: unknown) {
      if (recorded) throw error;
      recorded = true;
      const settled = recorder.fail(this.decodeFailure(error, spec.signal));
      // A protocol violation is OUR bug, not the provider's, and it is rethrown
      // as itself so `instanceof` still tells the two apart. The row is written
      // either way.
      if (isLlmStreamProtocolError(error)) {
        onSettled(settled);
        throw error;
      }
      throw settle(settled);
    } finally {
      preview.finish();
      if (!recorded) {
        // The consumer stopped pulling — a `break`, a `return`, an outer throw.
        // Generators are closed by injecting a return, which no `catch` sees, so
        // without this the header would sit forever unsettled and the log would
        // say a request was sent and never answered.
        recorded = true;
        onSettled(
          recorder.fail({
            failure: { message: "stream abandoned by the consumer", code: LLM_FAILURE_CODE.ABORTED },
            kind: "aborted",
            httpStatus: response.status,
            cause: "abandoned"
          })
        );
      }
    }
  }

  /** What the credentials seam says about the reference. Structurally value-free. */
  private describeCredential(route: PinnedRoute): RecordedCredential {
    if (route.credentialRef === null) {
      return { ref: "", configured: false, source: null };
    }
    const described = this.init.credentials.describe(route.credentialRef);
    return {
      ref: credentialRefName(route.credentialRef),
      configured: described.configured,
      source: described.source
    };
  }

  /** A transport that never produced a response — a refused connection, a timeout. */
  private transportFailure(
    error: unknown,
    signal: AbortSignal | undefined
  ): { failure: LlmFailure; kind: "error" | "aborted"; httpStatus: null; cause: string } {
    if (error instanceof EgressBlocked) {
      return { failure: { message: error.message, code: "AMC_RESIDENCY_EGRESS_BLOCKED" },
        kind: "error", httpStatus: null, cause: "residency_blocked" };
    }
    if (signal?.aborted === true) {
      return {
        failure: { message: "request aborted before the provider responded", code: LLM_FAILURE_CODE.ABORTED },
        kind: "aborted",
        httpStatus: null,
        cause: "aborted"
      };
    }
    const normalized = normalizeLlmFailure(error);
    return {
      failure:
        normalized.code === LLM_FAILURE_CODE.UNKNOWN
          ? { ...normalized, code: LLM_FAILURE_CODE.TRANSPORT }
          : normalized,
      kind: "error",
      httpStatus: null,
      cause: "transport"
    };
  }

  /** A stream that started and then broke — a bad frame, a dropped socket, a cancel. */
  private decodeFailure(
    error: unknown,
    signal: AbortSignal | undefined
  ): { failure: LlmFailure; kind: "error" | "aborted"; httpStatus: null; cause: string } {
    if (signal?.aborted === true) {
      return {
        failure: { message: "stream aborted by the caller", code: LLM_FAILURE_CODE.ABORTED },
        kind: "aborted",
        httpStatus: null,
        cause: "aborted"
      };
    }
    if (isLlmStreamProtocolError(error)) {
      // The AMC_-prefixed code is carried through deliberately: it is in no
      // policy's retryable set, so a signed row can never invite a retry of an
      // adapter bug.
      return {
        failure: { message: error.message, code: error.code },
        kind: "error",
        httpStatus: null,
        cause: "protocol"
      };
    }
    if (isLlmError(error)) {
      return { failure: error.failure, kind: "error", httpStatus: null, cause: "provider" };
    }
    const normalized = normalizeLlmFailure(error);
    return {
      failure:
        normalized.code === LLM_FAILURE_CODE.UNKNOWN
          ? { ...normalized, code: LLM_FAILURE_CODE.TRANSPORT }
          : normalized,
      kind: "error",
      httpStatus: null,
      cause: "decode"
    };
  }
}

/** The failure a route with an unresolvable credential produces. Names, never values. */
function missingCredentialFailure(route: PinnedRoute): LlmFailure {
  const name = route.credentialRef === null ? "(none)" : credentialRefName(route.credentialRef);
  return {
    message: `no layer supplies credential ${name} for provider ${route.providerId}`,
    code: LLM_FAILURE_CODE.MISSING_CREDENTIAL
  };
}
