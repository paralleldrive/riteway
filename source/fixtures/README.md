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

### `wrong-prompt.mdc`
Test fixture containing intentionally incorrect design guidelines.
- **Purpose**: Verify AI agents can identify and fail tests based on objectively bad design principles
- **⚠️ Note for human reviewers**: This file contains deliberately incorrect design guidance (e.g., inaccessible color choices). The meta-commentary has been removed so AI agents evaluate it on merit rather than being told it's wrong. Tests using this fixture should fail when the AI correctly identifies the design violations.

## Implementation Status

⚠️ **IMPORTANT**: The media embed feature is **partially implemented**.

- ✅ TAP formatting supports media embeds (`formatTAP()` in `test-output.js`)
- ✅ Unit tests verify formatter behavior
- ❌ Agent integration is missing - agents don't return media in responses
- ❌ End-to-end flow doesn't populate media field

See `MEDIA-EMBED-STATUS.md` for detailed implementation gap analysis.

## Requirements Reference

These fixtures demonstrate functionality specified in:
- **Epic**: `tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-01-22-riteway-ai-testing-framework.md`
- **Requirement**: "Given markdown media (images, screenshots), should embed them in TAP output" (line 57)
- **Technical Requirement**: "Given TAP output, should support markdown media embeds" (line 128)
