# Test Fixtures

This directory contains test fixtures for the Riteway AI testing framework.

## Fixtures

### `multi-assertion-test.sudo`
Example test file demonstrating basic SudoLang test format with multiple assertions.
- **Purpose**: Reference implementation of test file structure
- **Requirements tested**: Basic error-causes functionality

### `media-embed-test.sudo`
Example test file demonstrating markdown media embed functionality.
- **Purpose**: Verify media embeds in TAP output
- **Requirements tested**: Markdown media (images, screenshots) embedded in TAP output
- **Media assets**: References `docs/tap-color-scheme.svg` and `docs/tap-color-screenshot.png`

### `verify-media-embed.js`
Verification script that demonstrates the media embed feature.
- **Purpose**: Manual verification of media embed functionality
- **Usage**: `node source/fixtures/verify-media-embed.js`
- **Output**: Creates `ai-evals/media-embed-verification.tap.md` with example output

## Implementation Status

⚠️ **IMPORTANT**: The media embed feature is **partially implemented**.

- ✅ TAP formatting supports media embeds (`formatTAP()` in `test-output.js`)
- ✅ Unit tests verify formatter behavior
- ❌ Agent integration is missing - agents don't return media in responses
- ❌ End-to-end flow doesn't populate media field

See `MEDIA-EMBED-STATUS.md` for detailed implementation gap analysis.

## Manual Verification

To verify the media embed **formatter** (not end-to-end):

1. Run the verification script (uses mock data):
   ```bash
   node source/fixtures/verify-media-embed.js
   ```

2. Open the generated file in your browser or markdown viewer:
   ```bash
   open ai-evals/media-embed-verification.tap.md
   ```

3. Verify TAP formatter behavior:
   - [ ] Images display correctly in the markdown viewer
   - [ ] TAP format is preserved and compliant
   - [ ] Captions are readable and properly formatted
   - [ ] Multiple media attachments per assertion work
   - [ ] Assertions without media still format correctly

**Note**: Running `media-embed-test.sudo` through the CLI will NOT produce media embeds because the agent integration is incomplete.

## Requirements Reference

These fixtures demonstrate functionality specified in:
- **Epic**: `tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-01-22-riteway-ai-testing-framework.md`
- **Requirement**: "Given markdown media (images, screenshots), should embed them in TAP output" (line 57)
- **Technical Requirement**: "Given TAP output, should support markdown media embeds" (line 128)
