<!-- SPDX-License-Identifier: MIT -->
# 2. Conformance classes

Status: normative.

An implementation claims conformance to one or more classes. The cases that test each class, and the runner any
implementation can be checked with, are in [`spec/conformance/v1/`](../conformance/v1/README.md) (P1-32).

| Class | What an implementation does | Suite status |
| --- | --- | --- |
| Evidence producer | Writes `evidence-event` and `receipt` records that chain by hash and carry a claim kind | Normative (initial cases) |
| Adapter | Turns a hook payload and a policy into allow, deny or ask, with a receipt naming the hook as the boundary | Normative (initial cases) |
| Compiler | Turns the same inputs into the same plan digest; a crosswalk never auto-passes | Informative until P1-10's golden outputs exist |
| Verifier | Judges a record against a pinned trust list and an as-of time and reports each result separately (chapter 9) | Normative |

## Requirements for every class

1. A conformance claim MUST name the class, the spec version and the suite version it was tested against.
2. A class MUST NOT be claimed in part. An implementation conforms to a class only when a `conformance-results`
   record (`https://agentmaturity.co/spec/schemas/v1/conformance-results.schema.json`) for that class says
   `conformant: true`, which needs every normative case of the class to pass.
3. An implementation MUST NOT present synthetic, fixture or stub runs as observed results (chapter 3).

## Evidence producers

1. A producer MUST write records that parse under their published schema (chapter 4) and MUST label every result with
   one claim kind.
2. An importer, a producer that converts another system's records, MUST NOT claim that it enforced anything. It held
   no boundary, so its records carry enforcement `none` or `observed`, never `enforced`.
3. A producer MUST NOT label its own rows `independently_reviewed`.

## Adapters

1. An adapter MUST name the boundary that held in every receipt that claims enforcement.
2. An adapter in observation-only mode MUST NOT claim enforcement.
3. An adapter MUST fail closed: an unknown action class, an unknown authority or a policy it cannot read gives deny or
   ask, never allow.

## Compilers

1. The same profile, catalog lock and inputs MUST give the same plan digest.
2. A crosswalk from one framework to another MUST NOT mark a control as passed; it only says where to look.

## Verifiers

1. A verifier MUST implement the acceptance rules of chapter 9 in their order and MUST report each result separately.
2. A verifier MUST admit keys only from a trust list it pinned itself. A key carried inside a record MUST NOT vouch
   for that record.
3. A verifier MUST report missing input as not evaluated, never as pass.

## Interoperability

Interoperability between independent implementations MAY be claimed only after at least two independently built
verifiers pass every normative fixture in [`spec/fixtures/v1/`](../fixtures/v1/README.md). Until then, a document
SHOULD say "AMC's verifier passes the fixtures" and nothing broader.
