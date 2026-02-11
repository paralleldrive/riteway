#!/usr/bin/env node

/**
 * Manual Verification Script for Media Embed Functionality
 * 
 * This script demonstrates the markdown media embed feature by creating
 * mock test results with media attachments and formatting them as TAP output.
 * 
 * Usage: node source/fixtures/verify-media-embed.js
 */

import { formatTAP } from '../test-output.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// Mock test results with media embeds
const mockResults = {
  passed: true,
  assertions: [
    {
      passed: true,
      description: 'Given the color scheme, should include high contrast colors for readability',
      passCount: 4,
      totalRuns: 4,
      media: [
        {
          path: 'docs/tap-color-scheme.svg',
          caption: 'TAP Color Scheme Design with accessibility considerations'
        }
      ]
    },
    {
      passed: true,
      description: 'Given the color scheme, should use semantic colors (green for pass, red for fail)',
      passCount: 4,
      totalRuns: 4,
      media: [
        {
          path: 'docs/tap-color-screenshot.png',
          caption: 'Example TAP output showing semantic color usage'
        }
      ]
    },
    {
      passed: true,
      description: 'Given the color scheme, should be accessible to colorblind users',
      passCount: 3,
      totalRuns: 4,
      media: [
        {
          path: 'docs/tap-color-scheme.svg',
          caption: 'Color contrast analysis for deuteranopia accessibility'
        }
      ]
    },
    {
      passed: true,
      description: 'Given the design rationale, should explain the accessibility considerations',
      passCount: 4,
      totalRuns: 4
      // No media for this assertion
    }
  ]
};

const main = async () => {
  console.log('\n=== Media Embed Feature Verification ===\n');
  console.log('This script demonstrates the markdown media embed functionality');
  console.log('in TAP output format.\n');
  
  const tapOutput = formatTAP(mockResults);

  console.log('TAP Output with Media Embeds:\n');
  console.log('─'.repeat(60));
  console.log(tapOutput);
  console.log('─'.repeat(60));
  
  // Write to verification output file
  const outputDir = 'ai-evals';
  await mkdir(outputDir, { recursive: true });
  
  const outputPath = join(outputDir, 'media-embed-verification.tap.md');
  
  const markdownOutput = `# Media Embed Feature Verification

This file demonstrates the markdown media embed functionality in Riteway AI test output.

## Test File
- **Source**: \`source/fixtures/media-embed-test.sudo\`
- **Purpose**: Verify markdown media embeds in TAP output

## Features Demonstrated

1. **Image Embeds**: Images referenced in test assertions appear as markdown image syntax
2. **Multiple Media**: Assertions can have multiple media attachments
3. **Captions**: Each media embed includes a descriptive caption
4. **TAP Compliance**: Media embeds use TAP comment syntax (\`#\`) to maintain compatibility

## Test Output

${tapOutput}

## Media Assets Referenced

### TAP Color Scheme Diagram
![TAP Color Scheme Design](../docs/tap-color-scheme.svg)

*Design showing the accessible color palette used in TAP output*

### TAP Screenshot Example
![TAP Output Screenshot](../docs/tap-color-screenshot.png)

*Real-world example of TAP output with semantic colors*

## Manual Verification Checklist

- [ ] SVG image displays correctly in markdown viewer
- [ ] PNG screenshot displays correctly in markdown viewer
- [ ] Media embeds maintain TAP format compliance
- [ ] Captions are properly escaped and readable
- [ ] Multiple media per assertion work correctly
- [ ] Assertions without media still format correctly
`;
  
  await writeFile(outputPath, markdownOutput);
  
  console.log(`\n✓ Verification output written to: ${outputPath}`);
  console.log('\nTo verify the media embeds:');
  console.log(`  1. Open ${outputPath} in your browser or markdown viewer`);
  console.log('  2. Confirm that images display correctly');
  console.log('  3. Verify that TAP format is preserved');
  console.log('  4. Check that captions are readable and properly formatted\n');
};

main().catch(err => {
  console.error('Error during verification:', err);
  process.exit(1);
});
