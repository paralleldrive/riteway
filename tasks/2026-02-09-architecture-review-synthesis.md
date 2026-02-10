# Architecture Review Synthesis — PR #394

> **Date:** 2026-02-09
> **Team:** 3-agent review (Advocate, Devil's Advocate, Feasibility Analyst)
> **PR:** [#394 feat(ai-runner): implement core module with TDD](https://github.com/paralleldrive/riteway/pull/394)
> **Review:** [janhesters review (3764740159)](https://github.com/paralleldrive/riteway/pull/394#pullrequestreview-3764740159)
> **Status:** DECISION REQUIRED

---

## Executive Summary

Three independent analyses examined whether the current two-phase extraction architecture should be replaced with janhesters' proposed 3-actor orchestrator pipeline. The team reached a **convergent recommendation** despite arguing from opposing positions:

**All three analysts agree on the recommended path: Incremental 3-actor migration using Option A/B (CLI handles file I/O, agents handle reasoning).**

The key disagreement is on *severity* — the advocate sees the current implementation as a spec violation requiring correction; the devil's advocate sees it as a working system where the reviewer's comments are directional suggestions, not mandates. The feasibility analyst provides the tiebreaker: the incremental path scores highest (7.35/10) across requirements compliance, implementation risk, and agent compatibility.

---

## Where All Three Analysts Agree

| Point | Advocate | Devil's Advocate | Feasibility |
|-------|----------|-----------------|-------------|
| `validateFilePath` MUST be kept | Yes (Concern 2) | Yes | Yes (path traversal vulnerability) |
| Failure fixture is needed | Yes (reviewer's general comment) | Yes | Yes |
| Failure fixture unit test should use mock agent | Yes (Concern 3) | Yes | Yes |
| Tasks 2-6 (Zod, Try, IIFEs, error-causes, mutations) should ship | Yes | Yes (immediately) | Yes |
| `parseStringResult` multi-strategy parsing is overcomplicated | Yes | Yes (Section 9, point 1) | Yes (TAP is simpler) |
| `parseImports()` regex is too rigid | Yes | Yes (Section 9, point 2) | Yes |
| Option C (agent reads files directly) violates agent-agnostic requirement | Yes | Yes | Yes |
| Option A/B (CLI reads files, passes content) is pragmatically correct | Yes | Yes (it's what current impl does) | Yes (7.35 score) |
| Full big-bang rewrite carries significant risk | Acknowledged | Primary argument | Yes (scored 6.10) |

---

## Where They Disagree

### The Core Debate: "Don't Parse — It's a Prompt"

**Advocate position:** The current implementation violates the epic's "don't parse" requirement. `buildExtractionPrompt()` treats the test file as data to extract from, not as a prompt. `parseImports()` is deterministic regex parsing. The 3-actor pipeline corrects this by letting the AI orchestrator *understand* the file as a prompt.

**Devil's advocate position:** The current implementation DOES pass the complete file to AI — `buildExtractionPrompt()` embeds the entire file content unmodified. The AI does the extraction (not regex). `parseImports()` is file system reference resolution, not semantic parsing. The proposed architecture also parses — it just moves parsing to different boundaries.

**Feasibility position:** Both interpretations have merit. The epic's language is ambiguous. But the reviewer (janhesters) clearly favors Interpretation B (the test file IS the prompt to execute), and their comments come with architecture diagrams showing high conviction.

### Is This a Requirements Violation or an Implementation Preference?

| Analyst | Verdict |
|---------|---------|
| Advocate | **Requirements violation** — the epic says "don't parse", the code parses |
| Devil's Advocate | **Implementation preference** — the code works, satisfies all functional requirements, the "parsing" debate is semantic |
| Feasibility | **Gray area** — requirements are met functionally, but the spirit of "don't parse" is arguably violated by the extraction pipeline |

### Remediation Plan Interpretation

| Analyst | Verdict |
|---------|---------|
| Advocate | Accurate interpretation of reviewer's intent — diagrams signal architectural conviction |
| Devil's Advocate | **Over-interpretation** — 3 directional comments extrapolated into a complete 5-step rewrite; 13 of 16 comments need zero architecture change |
| Feasibility | The full replacement plan (scored 6.10) is riskier than necessary; the incremental path (scored 7.35) achieves the same goals |

---

## The Numbers

### AI Call Cost (4 assertions, 4 runs)

| Architecture | Total Calls | Serial Steps | Wall Clock |
|-------------|-------------|-------------|------------|
| Current (two-phase) | 17 | 1 (extraction) | ~45-135s |
| 3-Actor pipeline | 18 | 2 (orchestrator + result gen) | ~55-165s |
| Delta | +1 (5.9%) | +1 serial step | +10-30s |

### Migration Scope

| Metric | Count |
|--------|-------|
| Functions deleted | 9-10 |
| Functions added | 7 |
| Functions modified | 3 |
| LOC deleted | ~217 |
| LOC added | ~265 |
| Test assertions lost | ~36 |
| Test assertions gained | ~28 |
| Files deleted | 2 |
| Files created | 7 |

### Weighted Recommendation (from Feasibility)

| Approach | Score |
|----------|-------|
| **Incremental 3-Actor (Option A/B)** | **7.35/10** |
| Current (keep as-is + Tasks 2-6) | 6.85/10 |
| Full 3-Actor Replacement | 6.10/10 |

---

## Recommended Path Forward

### Phase 1: Ship Non-Architectural Fixes Now (Tasks 2-6)

All three analysts agree these are non-controversial and independent:

1. **Task 2:** Zod schema validation + centralized defaults (#1, #2, #3, #6, #7)
2. **Task 3:** getAgentConfig test patterns — remove IIFEs (#8, #9-#13)
3. **Task 4:** Error testing with Try (#14, #15, #16)
4. **Task 5:** Error-causes switch in ai-runner.js (#4)
5. **Task 6:** Eliminate mutations (#5)

### Phase 2: Incremental Architecture Migration (Task 1)

Using Option A/B (CLI reads files, AI reasons about content):

| Step | What | Risk | Can Ship Independently? |
|------|------|------|------------------------|
| 1 | Add TAP parser (`tap-parser.js`) | None — additive | Yes |
| 2 | Add prompt builders (`prompts/orchestrator.js`) | None — additive | Yes |
| 3 | Add result manager (`result-manager.js`) | Low — additive | Yes |
| 4 | Create `runAITests3Actor` alongside existing | Medium — new orchestration | Yes (unused until wired) |
| 5 | Wire up + switch over | **High** — user-facing change | This is the commit point |
| 6 | Delete dead code (test-extractor.js, etc.) | Low — cleanup | Yes (after step 5 verified) |
| 7 | Add failure fixture | Low — additive | Yes |

### Phase 3: Discuss with Reviewer

The devil's advocate raises a legitimate question: **Did janhesters intend a full 5-step 3-actor rewrite, or directional feedback?** The incremental path addresses the reviewer's core concerns (eliminate deterministic parsing, AI-driven understanding, TAP output) while managing risk.

Consider sharing this synthesis with the reviewer to confirm the incremental approach satisfies their intent before committing to the full pipeline.

---

## Open Questions for Your Decision

1. **Scope of Task 1:** Full 3-actor pipeline (higher risk, closer to reviewer's diagrams) or incremental migration (lower risk, pragmatic)?

2. **Reviewer alignment:** Should we share this analysis with janhesters to confirm the incremental path satisfies their intent before proceeding?

3. **Phase 1 vs Phase 2 ordering:** Ship Tasks 2-6 first (immediate, non-controversial) then tackle Task 1? Or address Task 1 first since it may change the scope of other tasks?

4. **Import syntax change (D9):** Update to `import @ai/rules/ui.mdc` (no `from` clause) now, or defer? The AI orchestrator handles either format, so this is cosmetic.

---

## Individual Analysis Documents

- [Advocate Position](./2026-02-09-architecture-review-advocate.md) — argues FOR the 3-actor pipeline
- [Devil's Advocate Position](./2026-02-09-architecture-review-devils-advocate.md) — challenges whether re-architecture is necessary
- [Technical Feasibility Assessment](./2026-02-09-architecture-review-feasibility.md) — objective risk/cost analysis

## References

- [Epic Requirements](./archive/2026-01-22-riteway-ai-testing-framework/2026-01-22-riteway-ai-testing-framework.md)
- [Remediation Plan](./2026-02-09-pr394-remediation.md)
- [Architecture Review](./2026-02-09-task1-architecture-review.md)
- [vision.md](../vision.md) — "The standard testing framework for AI Driven Development and software agents"
- [AGENTS.md](../AGENTS.md) — Progressive discovery, vision-first
- [please.mdc](../ai/rules/please.mdc) — "Do ONE THING at a time"
- [javascript.mdc](../ai/rules/javascript/javascript.mdc) — KISS, YAGNI, DRY, SDA, one job per function
- [tdd.mdc](../ai/rules/tdd.mdc) — Test isolation, TDD process
- [error-causes.mdc](../ai/rules/javascript/error-causes.mdc) — Structured error handling
- [PR #394 Review](https://github.com/paralleldrive/riteway/pull/394#pullrequestreview-3764740159) — janhesters' 19 inline comments
