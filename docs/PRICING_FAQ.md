# PRICING_FAQ.md — Pricing Questions

## Is AMC free?
Yes. The whole product is MIT licensed and free: Score, Shield, Enforce, Vault, Watch, Comply, Fleet, Passport, all 41 Industry Packs (in the current source build; see the next answer), all 16 adapters, 1,278 CLI command paths, browser playground, and CI gates.

## What costs money?
Nothing in the product. Industry Packs, the 41 sector-specific domain packs for regulated verticals like healthcare, finance, education, and government, are free in the current source build (unreleased; the next release is 2.0.0): no licence, account or payment (ADR 019, `docs/adr/019-industry-packs-free.md`, decided on 2026-11-07), and there is no checkout. The published 1.1.1 release still asks for a licence before pack questions and runs, and its checkout never went live, so use the source build for packs.

## Do I need Industry Packs?
Not unless you work in a regulated industry and want sector-specific questionnaires and compliance mappings. They are self-reported questionnaires whose content is experimental (AI-drafted until a named expert signs it), and a pack result is never a certification or a compliance verdict. The core trust stack works without them.

## Can I build my own domain packs?
Yes. AMC's pack system is extensible. You can create custom packs for any domain.

## Will free features become paid later?
No. MIT license is permanent. The trust stack stays free.

## What is planned for Enterprise?
Priority support, custom pack development, and deployment assistance. Industry Packs are not an Enterprise feature: every pack is free for everyone. This is contact-first planning, not a self-serve product claim.

## Is there a trial for Industry Packs?
No trial is needed in the current source build: every pack is free, with no licence or account, and `amc domain pack list` lists them. The published 1.1.1 release still asks for a licence (see "What costs money?").

## Read next
- `docs/PRICING.md`
- `docs/PRODUCT_EDITIONS.md`
