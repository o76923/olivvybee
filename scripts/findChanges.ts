import path from 'path';
import fs from 'fs';

import { getOctokit, context } from '@actions/github';
import { setOutput } from '@actions/core';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  throw new Error('process.env.GITHUB_TOKEN is required');
}

const GITHUB_REF = process.env.GITHUB_REF;
if (!GITHUB_REF) {
  throw new Error('process.env.GITHUB_REF is required');
}

const tagName = GITHUB_REF.replace('refs/tags/', '');
const normalisedTagName = tagName.split('/').join('-');

const repoUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}`;
const previewUrl = `${repoUrl}/releases/download/${tagName}/preview-updates-${normalisedTagName}.png`;

enum ChangeType {
  added = 'Added',
  updated = 'Updated',
}

interface EmojiChange {
  name: string;
  change: ChangeType;
}

interface Author {
  login: string;
  html_url: string;
}

const buildRelaseNotes = (
  changeList: string,
  changedEmojis: EmojiChange[],
  contributors: Author[]
) => {
  const newEmojis = changedEmojis
    .filter(({ change }) => change === ChangeType.added)
    .map(({ name }) => `- \`${name}\``)
    .join('\n');

  const newSection = newEmojis.length
    ? `### New

${newEmojis}
`
    : '';

  const updatedEmojis = changedEmojis
    .filter(({ change }) => change === ChangeType.updated)
    .map(({ name }) => `- \`${name}\``)
    .join('\n');

  const updatedSection = updatedEmojis.length
    ? `### Updated

${updatedEmojis}
`
    : '';

  const contributorList = contributors.length
    ? contributors
        .map(
          (contributor) => `- [${contributor.login}](${contributor.html_url})`
        )
        .join('\n')
    : '';
  const contributorsSection = contributors.length
    ? `
## Contributors to this release

${contributorList}

`
    : '';

  return `
## New and updated emojis in this release

${
  changedEmojis.length
    ? `![A grid of the emojis that were new or updated in this release](${previewUrl})
  
${newSection}

${updatedSection}
`
    : 'None.'
}
*See the [README](${repoUrl}) for usage instructions.*

${contributorsSection}
<details>
<summary>
<h2>All changes in this release</h2>
</summary>

${changeList}
</details>
`;
};

const run = async () => {
  const octokit = getOctokit(GITHUB_TOKEN);

  const { data: releases } = await octokit.rest.repos.listReleases({
    ...context.repo,
  });
  const nonPrereleaseReleases = releases.filter(
    (release) => !release.prerelease
  );
  if (!nonPrereleaseReleases.length) {
    console.log('No non-prerelease releases found to compare against.');
    setOutput('hasSvgChanges', false);
    return;
  }
  const previousTag = nonPrereleaseReleases[0].tag_name;

  const { data: changes } = await octokit.rest.repos.compareCommits({
    ...context.repo,
    base: previousTag,
    head: GITHUB_REF,
  });

  const files = changes.files || [];

  const svgChanges = files.filter(
    (file) => file.filename.endsWith('.svg') && file.status !== 'removed'
  );
  const changedSvgs = svgChanges.map((file) => file.filename);

  const commitMessages = changes.commits.map((commit) => commit.commit.message);
  const changeList = commitMessages
    .map((message) => `- ${message.split('\n')[0]}`)
    .join('\n');

  const changedEmojis = changedSvgs.map((filePath) => ({
    name: filePath.slice(filePath.lastIndexOf('/') + 1).replace('.svg', ''),
    change: svgChanges.some(
      (change) => change.filename === filePath && change.status === 'added'
    )
      ? ChangeType.added
      : ChangeType.updated,
  }));

  const contributors = changes.commits
    .flatMap((commit) => commit.author)
    .filter((author) => !!author)
    .filter((author) => author.login !== 'olivvybee')
    .reduce((unique, current) => {
      if (unique.find((item) => item.login === current.login)) {
        return unique;
      }

      return [...unique, current];
    }, [] as Author[]);

  const releaseNotes = buildRelaseNotes(
    changeList,
    changedEmojis,
    contributors
  );
  setOutput('releaseNotes', releaseNotes);

  if (!changedSvgs.length) {
    console.log('No changes to SVGs found since previous release.');
    setOutput('hasSvgChanges', false);
    return;
  }

  const changesDir = path.resolve('.', `updates-${normalisedTagName}`);
  fs.mkdirSync(changesDir, { recursive: true });

  changedSvgs.forEach((filePath) => {
    const filename = filePath.slice(filePath.lastIndexOf('/'));
    const srcPath = path.resolve('.', filePath);
    const destPath = path.join(changesDir, filename);
    fs.copyFileSync(srcPath, destPath);
  });

  setOutput('hasSvgChanges', true);
};

run();
