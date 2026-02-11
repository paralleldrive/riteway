# Media Embed Test - IMPLEMENTATION GAP DOCUMENTATION

## Status: ⚠️ PARTIALLY IMPLEMENTED

The markdown media embed functionality has TAP formatting support but lacks agent integration.

## What Works ✅

1. **`formatTAP()` function** (`source/test-output.js`)
   - Can format media embeds in TAP output
   - Syntax: `# ![caption](path)`
   - Properly escapes markdown special characters
   - Places media after pass rate diagnostic

2. **Unit tests** (`source/test-output.test.js`)
   - 6 tests covering media embed formatting
   - Tests for single/multiple media per assertion
   - Tests for assertions without media
   - All tests passing ✅

## What's Missing ❌

### 1. Agent Response Schema

Currently agents return:
```json
{
  "passed": true
}
```

For media embeds to work, agents would need to return:
```json
{
  "passed": true,
  "media": [
    {
      "path": "docs/screenshot.png",
      "caption": "Screenshot showing the test result"
    }
  ]
}
```

### 2. Agent Integration in `ai-runner.js`

The `executeAgent()` function (line 170-266) needs to:
- Extract media from agent responses
- Validate media paths exist
- Pass media to aggregation functions

The `aggregatePerAssertionResults()` function (line 279-297) needs to:
- Merge media from multiple runs (or pick from first run)
- Include media in assertion objects

### 3. Test Prompts Need Media Instructions

Test files like `media-embed-test.sudo` would need to instruct agents to:
- Generate or reference relevant media
- Return media in the expected format
- Provide descriptive captions

## Current Test Execution

When you run:
```bash
node bin/riteway ai source/fixtures/media-embed-test.sudo
```

**What happens:**
1. Agent evaluates assertions ✅
2. Returns `{"passed": true}` for each ✅
3. `ai-runner.js` aggregates results ✅  
4. `formatTAP()` is called with no media field ✅
5. TAP output contains no media embeds ❌

**The media field is never populated**, so no media embeds appear in output.

## Workaround: Mock Verification Script

The `verify-media-embed.js` script demonstrates the feature by:
- Manually creating mock results with media
- Calling `formatTAP()` directly
- Showing what output WOULD look like

This proves the formatter works, but doesn't test real agent integration.

## To Fully Implement Media Embeds

### Option 1: Agent-Generated Media (Complex)
Agents would need to:
- Generate screenshots/diagrams
- Save to files
- Return paths in responses

Challenges:
- Agents don't have file system access by default
- Image generation requires additional tools/APIs
- Path resolution complexity

### Option 2: Agent-Referenced Media (Simpler)  
Agents could:
- Reference existing project assets
- Validate paths exist
- Return references in responses

Challenges:
- Agents need access to file listings
- Path validation required
- Security concerns with path traversal

### Option 3: Manual Media Specification (Pragmatic)
Test files could specify media upfront:
```sudolang
requirements = [
  {
    description: "Given X, should Y",
    media: [{ path: "docs/screenshot.png", caption: "..." }]
  }
]
```

Then `extractTests()` in `test-extractor.js` would parse and include media.

## Recommendation

**Option 3 (Manual Specification)** is most practical because:
- No agent modifications needed
- Media paths are explicit in test files
- Security is easier (validate at parse time)
- Works with any agent
- Deterministic (same media every run)

## Example: What Full Implementation Would Look Like

### Test File (with Option 3 approach):
```sudolang
import @promptUnderTest from 'ai/rules/ui.mdc'

userPrompt = """
Review the color scheme in the screenshot for accessibility.
"""

requirements = [
  {
    description: "Given the screenshot, should identify semantic colors",
    media: [
      {
        path: "docs/tap-color-screenshot.png",
        caption: "TAP output showing semantic color usage"
      }
    ]
  }
]
```

### Modified `test-extractor.js`:
Parse requirements object including media field, pass through to test assertions.

### Modified `ai-runner.js`:  
Include media in assertion objects when aggregating results.

### Result:
TAP output would contain:
```tap
ok 1 - Given the screenshot, should identify semantic colors
  # pass rate: 4/4
  # ![TAP output showing semantic color usage](docs/tap-color-screenshot.png)
```

## Conclusion

The media embed feature has solid TAP formatting support, but **requires additional implementation in test extraction and agent integration** to work end-to-end.

The current fixture (`media-embed-test.sudo`) demonstrates the test file format but cannot produce media embeds without the missing integration code.

---

**Reference**: Requirements in `tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-01-22-riteway-ai-testing-framework.md`
- Line 57: "Given markdown media (images, screenshots), should embed them in TAP output"  
- Line 128: "Given TAP output, should support markdown media embeds"

**Status**: ⚠️ Formatting implemented, integration missing
