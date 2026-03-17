# aidd-churn — Hotspot Analysis Reference

`npx aidd churn` ranks every file in a git repo by a composite hotspot score so
you can find the highest-risk code before you open a PR or start a refactor.

## Why hotspot analysis matters

AI agents generate code fast. Without a signal for where complexity actually
lives, reviews miss the files most likely to harbour bugs, and PRs grow until
they're impossible to scope sensibly.

The three signals that predict future defects are well-established in empirical
software engineering research:

| Signal | What it captures |
| --- | --- |
| **Size (LoC)** | More code = more surface area for bugs and cognitive load |
| **Churn** | Frequently changed files attract bugs; instability is a defect predictor |
| **Cyclomatic complexity** | High branch count means harder to test, reason about, and review |

Multiplying them together produces a single score that surfaces the files where
all three risks overlap — the true hotspots.

## The score formula

```
score = LoC × churn × complexity
```

- **LoC** — raw line count of the file
- **Churn** — number of commits that touched the file in the configured window
  (default: last 90 days, `--days` flag)
- **Complexity** — cyclomatic complexity via `tsmetrics-core` (JS/TS only;
  non-JS/TS files default to 1)

A file ranked #1 is large, touched constantly, and full of branches. That is
where refactoring effort pays off most.

## Output columns

| Column | Description |
| --- | --- |
| **Score** | `LoC × churn × complexity` — primary sort key |
| **LoC** | Lines of code |
| **Churn** | Commit touch count in the window |
| **Cx** | Cyclomatic complexity |
| **Density** | `gzip size / raw size` as a percentage — a code quality signal; **higher is generally better** (see below) |
| **File** | Relative path from project root |

### Density: a code quality signal

The Density column shows how well the file compresses — specifically `gzip_size / raw_size`
expressed as a percentage.

Gzip (DEFLATE / LZ77) achieves compression by replacing repeated byte sequences with short
back-references. The more repetition a file contains, the smaller the compressed output and
the lower the percentage. This makes gzip ratio a practical proxy for information density —
the amount of unique, non-redundant content per line.

| Density % | Interpretation |
| --- | --- |
| **High (e.g. 80–95%)** | File compresses poorly — content is non-repetitive. **Generally a good sign**: code is unique and not copy-pasted. |
| **Low (e.g. 20–40%)** | File compresses heavily — lots of repeated patterns. A warning sign for copy-paste duplication, boilerplate, or bloated switch/if chains. |
| **Very high (95%+)** | Rarely seen in well-structured source. May indicate minified, obfuscated, or auto-generated content. Worth inspecting, but not inherently a problem. |

Healthy application code typically falls in the 50–85% range. A file with unusually low
density in the hotspot list is doubly worth refactoring: it scores high on risk *and*
contains structural repetition that a refactor could eliminate.

**Important:** density is a supplemental display column only — it does not factor into the
hotspot score. The score formula remains `LoC × churn × complexity`.

## CLI usage

```bash
npx aidd churn                  # top 20 files, 90-day window
npx aidd churn --days 30        # tighten the window
npx aidd churn --top 10         # fewer results
npx aidd churn --min-loc 100    # exclude small files
npx aidd churn --json           # machine-readable output
```

## Interpreting results

- **Before splitting a PR** — files in the top results that appear in your diff
  are the best candidates for extraction into a separate PR.
- **Before a refactor** — high-scoring files have the highest ROI for
  simplification; reducing complexity or size drops the score significantly.
- **During code review** — run `npx aidd churn` and cross-reference the output
  against the diff. Any changed file in the top 10 warrants extra scrutiny.
- **As a trend** — compare `--days 30` vs `--days 90` to see whether hotspots
  are growing or shrinking over time.

## How to reduce a hotspot score

1. **Lower LoC** — extract pure utility functions or constants into separate
   modules. Smaller files are easier to test and understand.
2. **Lower complexity** — flatten nested conditionals, extract named predicates,
   replace `switch` trees with lookup maps.
3. **Lower churn** — if a file changes constantly because it owns too many
   responsibilities, split it. Stable interfaces churn less.
