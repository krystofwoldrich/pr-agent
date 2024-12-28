import * as path from 'path';
import * as vscode from 'vscode';

import { getRemotes, isGitRepository, parseGitConfig, parseRemoteUrl } from './git';
import { clearGithubToken, getGithubToken } from './secrets';
import { GitHubResponse, getLatestNumbers } from './api';
import { getMarkDownTemplate, getMarkDownTemplateOnlyNumber } from './template';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'pr-agent.nextPullLink',
      () => nextPullRequest(context, { style: 'link' }),
    ),
    vscode.commands.registerCommand(
      'pr-agent.nextPullNumber',
      () => nextPullRequest(context, { style: 'number' }),
    ),
    vscode.commands.registerCommand(
      'pr-agent.clearExtensionSecrets',
      () => clearExtensionSecrets(context),
    ),
  );
}

export function deactivate() {}

async function clearExtensionSecrets(context: vscode.ExtensionContext) {
  await clearGithubToken(context.secrets);
  vscode.window.showInformationMessage('Extension secrets cleared.');
}

async function nextPullRequest(
  context: vscode.ExtensionContext,
  options: {
    style: 'number' | 'link';
  },
) {
  const cursor = vscode.window.activeTextEditor?.selection.active;
  if (!cursor) {
    return;
  }

  const currentlyOpenTabFilePath = vscode.window.activeTextEditor?.document.fileName;
  if (!currentlyOpenTabFilePath) {
    vscode.window.showErrorMessage('Could not find currently open file path and thus detect GitHub repository and the next PR number.');
    return;
  }

  const remoteUrl = await getRemoteUrlFrom(currentlyOpenTabFilePath);
  if ('errorMessage' in remoteUrl) {
    vscode.window.showErrorMessage(remoteUrl.errorMessage);
    return;
  }

  const parsedRemoteUrl = parseRemoteUrl(remoteUrl.value);
  if (!parsedRemoteUrl) {
    vscode.window.showErrorMessage(`Failed to parse remote URL ${remoteUrl.value}.`);
    return;
  }

  const token = await getGithubToken(context.secrets);
  const data = await getLatestNumbers(token, parsedRemoteUrl.owner, parsedRemoteUrl.name);
  if (!data) {
    return;
  }

  const current = getCurrentLatestNumber(data);
  const next = current + 1;

  let maybeContent: string | undefined = undefined;
  try {
    maybeContent = getFinalContent(
      {
        nextPullNumber: next,
        repoOwner: parsedRemoteUrl.owner,
        repoName: parsedRemoteUrl.name,
      },
      options,
    );
  } catch (error) {
    if (error instanceof Error) {
      vscode.window.showErrorMessage(error.message);
    } else {
      vscode.window.showErrorMessage('Unknown error during content creation.');
    }
    return;
  }

  const finalContent = maybeContent;
  if (!finalContent) {
    vscode.window.showErrorMessage('Could not create content.');
    return;
  }

  vscode.window.activeTextEditor?.edit(editBuilder => {
    editBuilder.insert(cursor, finalContent);
  });
}

async function getRemoteUrlFrom(filePath: string): Promise<{
  value: string,
} | {
  errorMessage: string,
}> {
  const dirName = path.dirname(filePath);
  if (!isGitRepository(dirName)) {
    return { errorMessage: `GitHub repository not found based on currently active editor (${filePath}).` };
  }

  const gitConfig = parseGitConfig(dirName);
  const gitRemotes = getRemotes(gitConfig);

  const selectedRemoteKey = gitRemotes.length !== 1
    ? await vscode.window.showQuickPick(gitRemotes)
    : gitRemotes[0];
  if (!selectedRemoteKey) {
    return { errorMessage: `No remote of ${gitRemotes.join(', ')} has been selected.` };
  }

  const remoteUrl = gitConfig[selectedRemoteKey].url;
  if (!remoteUrl) {
    return { errorMessage: `No remote URL found for ${selectedRemoteKey}.` };
  }

  return { value: remoteUrl };
}

function getFinalContent(
  content: {
    nextPullNumber: number;
    repoOwner: string;
    repoName: string;
  },
  options: {
    style: 'number' | 'link';
  },
): string {
  if (options.style === 'number') {
    return getMarkDownTemplateOnlyNumber(content.nextPullNumber);
  }

  if (options.style === 'link') {
    return getMarkDownTemplate(content.nextPullNumber, content.repoOwner, content.repoName);
  }

  throw new Error('Unknown style. Can not create content.');
}

function getCurrentLatestNumber(data: GitHubResponse['data']) {
  return Math.max(
    data.repository?.discussions?.nodes?.[0]?.number || 0,
    data.repository?.issues?.nodes?.[0]?.number || 0,
    data.repository?.pullRequests?.nodes?.[0]?.number || 0,
  );
}