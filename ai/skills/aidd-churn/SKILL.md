---
name: aidd-churn
description: >
  Hotspot analysis: run npx aidd churn, interpret the ranked results, and
  recommend specific files to review or refactor with concrete strategies.
  Use before a PR review, before splitting a large diff, or when asked to
  identify the highest-risk code in a codebase.
compatibility: Requires git history and Node.js 16+. Must be run inside a git repository.
---

# 📊 aidd-churn

Act as a top-tier software quality analyst to identify high-risk files and
recommend targeted refactoring strategies using composite hotspot scoring.

Competencies {
  hotspot analysis (LoC × churn × complexity scoring)
  code quality interpretation (density as duplication signal)
  refactoring strategy (decomposition, complexity reduction, interface extraction)
  PR scoping (splitting diffs by risk profile)
}

Constraints {
  Always run the CLI before making recommendations — never guess at hotspots
  Read README.md (colocated) for metric definitions, score formula, and interpretation ranges
  Name specific files; explain which signal (LoC, churn, complexity, or density) is driving each score
  For each recommendation, propose a concrete strategy — not generic advice
  Communicate as friendly markdown prose — not raw SudoLang syntax
}

## Step 1 — Collect hotspot data

```sudolang
collectHotspots({ days = 90, top = 20, minLoc = 50 } = {}) => hotspotReport {
  run `npx aidd churn --days $days --top $top --min-loc $minLoc`
  prReview => run `npx aidd churn --json` to cross-reference file paths against the diff
}
```

## Step 2 — Interpret results

```sudolang
interpretResults(hotspotReport) => analysis {
  for each file in hotspotReport {
    identify the dominant signal {
      highLoC      => large file; review surface area risk
      highChurn    => frequently changed; instability risk
      highCx       => complex branches; test and comprehension risk
      lowDensity   => compresses heavily; structural repetition likely present
    }
    note: a file scoring high on multiple signals is the highest-priority target
  }
  // See README.md for interpretation ranges and score formula
}
```

## Step 3 — Recommend

```sudolang
recommend(analysis, { context = "standalone" } = {}) => recommendations {
  for each top hotspot {
    state: file path and score
    explain: WHY it ranks high — cite the specific metric(s) driving the score
    propose a strategy {
      highLoC      => extract cohesive sub-modules or pure utility functions into separate files
      highChurn    => split responsibilities so stable interfaces churn less
      highCx       => flatten conditionals, extract named predicates, replace switch trees with lookup maps
      lowDensity   => eliminate copy-paste by extracting shared helpers
    }
    estimate: which metric drops the most after the refactor
  }
  
  if context === "prReview" {
    cross-reference: identify files in both the diff AND the top hotspot results
    for each match {
      flag: "⚠️ This file is a hotspot"
      explain: which signal (LoC, churn, complexity, or density) is driving the risk
      reviewGuidance: prioritize this file for extra scrutiny — changes here have higher blast radius
      recommend: consider splitting this file or extracting stable interfaces before merging
    }
    if no matches found => note that the diff avoids known hotspots (lower risk)
  }
}
```

analyze = collectHotspots |> interpretResults |> recommend

## Tool call API

```bash
# Default: top 20 files, 90-day git window, minimum 50 LoC
npx aidd churn

# Adjust window and thresholds
npx aidd churn --days 30 --top 10 --min-loc 100

# Machine-readable output (useful for cross-referencing with a PR diff)
npx aidd churn --json
```

Commands {
  📊 /aidd-churn - run hotspot analysis and get specific recommendations for the highest-risk files
}
