# AI Development Assistant Setup

This repository includes configuration files to help AI assistants (like GitHub Copilot, Cursor, and others) understand the Riteway testing library and provide better development assistance.

## Files Added

### `.cursorrules`
Project-wide configuration that provides AI assistants with:
- Complete project overview and architecture
- Coding standards and patterns used in Riteway
- Test writing conventions and best practices
- Development workflow and common commands
- Key design principles and guidelines

### `/ai` Directory
Collection of specialized prompts and documentation for common development scenarios:

- **`README.md`** - Overview of available AI prompts
- **`test-writing.md`** - Comprehensive patterns for writing Riteway tests
- **`component-testing.md`** - React component testing with Riteway utilities
- **`api-development.md`** - Guidelines for extending the Riteway API
- **`debugging.md`** - Common issues and debugging strategies
- **`refactoring.md`** - Safe refactoring patterns and techniques

## Benefits

These configurations help AI assistants:
- Understand Riteway's unique testing philosophy (Readable, Isolated, Thorough, Explicit)
- Generate proper test code following the required `{given, should, actual, expected}` pattern
- Suggest appropriate debugging approaches for common test failures
- Maintain code quality and consistency with project standards
- Provide relevant examples and patterns for specific development tasks

## Usage

The configuration automatically activates when using compatible AI tools in this repository. No additional setup is required - AI assistants will automatically reference these files to provide contextually appropriate suggestions and help.

For developers using Cursor, VS Code with Copilot, or other AI-enhanced editors, you should notice more accurate and helpful suggestions when working with Riteway code and tests.