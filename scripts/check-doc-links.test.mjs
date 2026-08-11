import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkDocumentationLinks,
  markdownAnchorIds,
  markdownLinkTargets,
} from './check-doc-links.mjs';

describe('documentation link helpers', () => {
  const directories = [];

  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('builds duplicate GitHub-style heading anchors', () => {
    expect([...markdownAnchorIds('# Setup\n## Setup\n### Provider & safety')]).toEqual([
      'setup',
      'setup-1',
      'provider-safety',
    ]);
  });

  it('removes nested HTML tag delimiters without exposing tag names', () => {
    expect([
      ...markdownAnchorIds(
        '# <strong>Safe</strong> heading\n## <scr<script>ipt>Blocked</script>\n### Love <3',
      ),
    ]).toEqual(['safe-heading', 'blocked', 'love-3']);
  });

  it('extracts local Markdown links and images', () => {
    expect(markdownLinkTargets('[guide](docs/guide.md#setup) ![shot](images/a.png)')).toEqual([
      'docs/guide.md#setup',
      'images/a.png',
    ]);
  });

  it('validates a local file and anchor through one opened file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-doc-links-'));
    directories.push(root);
    const docs = path.join(root, 'docs');
    await mkdir(docs);
    await Promise.all([
      writeFile(path.join(root, 'README.md'), '[Guide](docs/guide.md#setup)'),
      writeFile(path.join(root, 'AGENTS.md'), ''),
      writeFile(path.join(docs, 'guide.md'), '# Setup'),
    ]);

    await expect(checkDocumentationLinks(root)).resolves.toEqual({ checkedFiles: 3 });
  });
});
