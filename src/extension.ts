import * as path from 'path';
import * as vscode from 'vscode';

import { getRemotes, isGitRepository, parseGitConfig, parseRemoteUrl, GitConfig, GitConfigRemoteKey } from './git';
import { clearGithubToken, getGithubToken } from './secrets';
import { getLatestNumbers } from './api';
import { getMarkDownTemplate, getMarkDownTemplateOnlyNumber } from './template';
import { Value } from './types';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'pr-agent.nextPullLink',
      () => insertPull(context, { style: 'link', type: 'next' }),
    ),
    vscode.commands.registerCommand(
      'pr-agent.nextPullNumber',
      () => insertPull(context, { style: 'number', type: 'next' }),
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

async function insertPull(
  context: vscode.ExtensionContext,
  options: {
    style: 'number' | 'link';
    type: 'next';
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

  const dirPath = path.dirname(currentlyOpenTabFilePath);
  if (!isGitRepository(dirPath)) {
    vscode.window.showErrorMessage(`GitHub repository not found based on currently active editor (${currentlyOpenTabFilePath}).`);
    return;
  }

  const gitConfig = parseGitConfig(dirPath);

  const remoteUrl = await getRemoteUrlFrom(gitConfig);
  if ('errorMessage' in remoteUrl) {
    vscode.window.showErrorMessage(remoteUrl.errorMessage);
    return;
  }

  const remote = parseRemoteUrl(remoteUrl.value);
  if (!remote) {
    vscode.window.showErrorMessage(`Failed to parse remote URL ${remoteUrl.value}.`);
    return;
  }

  const token = await getGithubToken(context.secrets);
  let pullNumber = null;
  if (options.type === 'next') {
    const data = await getLatestNumbers(token, remote.owner, remote.name);
    if (data) {
      pullNumber = getCurrentLatestNumber(data) + 1;
    };
  }

  if (pullNumber === null) {
    vscode.window.showErrorMessage(`Failed to get ${options.type} pull number.`);
    return;
  }

  let content: string | null = null;
  if (options.style === 'number') {
    content = getMarkDownTemplateOnlyNumber(pullNumber);
  } else if (options.style === 'link') {
    content = getMarkDownTemplate(pullNumber, remote.owner, remote.name);
  }

  if (content === null) {
    vscode.window.showErrorMessage('Could not create content.');
    return;
  }

  vscode.window.activeTextEditor?.edit(editBuilder => {
    editBuilder.insert(cursor, content);
  });
}

async function getRemoteUrlFrom(gitConfig: GitConfig): Promise<Value<string>> {
  const gitRemotes = getRemotes(gitConfig);

  const selectedRemoteKey: GitConfigRemoteKey | undefined = gitRemotes.length !== 1
    ? await vscode.window.showQuickPick(gitRemotes) as GitConfigRemoteKey
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

function getCurrentLatestNumber(data: NonNullable<Awaited<ReturnType<typeof getLatestNumbers>>>) {
  return Math.max(
    data.repository?.discussions?.nodes?.[0]?.number || 0,
    data.repository?.issues?.nodes?.[0]?.number || 0,
    data.repository?.pullRequests?.nodes?.[0]?.number || 0,
  );
}
