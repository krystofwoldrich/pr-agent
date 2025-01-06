import * as path from 'path';
import * as vscode from 'vscode';

import { getRemotes, isGitRepository, parseGitConfig, parseRemoteUrl, parseGitHead, stripRefsHeadsPrefix, getBranch, GitConfig, GitConfigRemote, GitRemote, GitConfigRemoteKey } from './git';
import { clearGithubToken, getGithubToken } from './secrets';
import { getAssociatedPulls, getLatestNumbers } from './api';
import { getMarkDownTemplate, getMarkDownTemplateOnlyNumber } from './template';
import { Value } from './types';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'pr-agent.nextPullNumber',
      () => insertPull(context, { style: 'number', type: 'next' }),
    ),
    vscode.commands.registerCommand(
      'pr-agent.nextPullLink',
      () => insertPull(context, { style: 'link', type: 'next' }),
    ),
    vscode.commands.registerCommand(
      'pr-agent.currentPullNumber',
      () => insertPull(context, { style: 'number', type: 'current' }),
    ),
    vscode.commands.registerCommand(
      'pr-agent.currentPullLink',
      () => insertPull(context, { style: 'link', type: 'current' }),
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
    type: 'current' | 'next';
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
  if (options.type === 'current') {
    pullNumber = await getCurrentPullNumber(currentlyOpenTabFilePath, gitConfig, token, remote, dirPath);
  } else if (options.type === 'next') {
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

async function getCurrentPullNumber(
  currentlyOpenTabFilePath: string,
  gitConfig: GitConfig,
  token: string,
  remote: GitRemote,
  dirPath: string): Promise<number | null> {
  const head = parseGitHead(path.dirname(currentlyOpenTabFilePath));
  if ('commit' in head) {
    vscode.window.showErrorMessage(`Can't retrieve pull number for detached head (${head.commit}).`);
    return null;
  }

  const localBranchName = stripRefsHeadsPrefix(head.ref);
  if (localBranchName === null) {
    vscode.window.showErrorMessage(`Only \`refs/heads/\` prefix is supported at the moment. Received \`${head.ref}\`.`);
    return null;
  }

  const remoteBranch = getBranch(gitConfig, localBranchName);
  if (remoteBranch === null) {
    vscode.window.showErrorMessage(`Failed to find remote branch ref for \`${head.ref}\``);
    return null;
  }
  if (!remoteBranch.merge) {
    vscode.window.showErrorMessage(`Failed to find branch \`${localBranchName}\` in \`${dirPath}\` Git Config`);
    return null;
  }

  const remoteBranchName = stripRefsHeadsPrefix(remoteBranch.merge);
  if (remoteBranchName === null) {
    vscode.window.showErrorMessage(`Only \`refs/heads/\` prefix is supported at the moment. Received \`${remoteBranch.merge}\`.`);
    return null;
  }

  const data = await getAssociatedPulls(
    token,
    remote.owner,
    remote.name,
    remoteBranchName
  );

  if (data === null) {
    vscode.window.showErrorMessage(`Failed to retrieve associated pull requests from GitHub API.`);
    return null;
  }

  const pullNumberValue = await getPullNumber(data);
  if ('errorMessage' in pullNumberValue) {
    vscode.window.showErrorMessage(pullNumberValue.errorMessage);
    return null;
  }

  return pullNumberValue.value;
}

async function getPullNumber(data: Awaited<ReturnType<typeof getAssociatedPulls>>): Promise<Value<number>> {
  const pulls = data?.repository.ref.associatedPullRequests.nodes || [];

  const selectedPullNumber = pulls.length !== 1
  ? (await vscode.window.showQuickPick(pulls.map(p => ({
      label: `#${p.number} - ${p.title}`,
      description: p.state,
      pullNumber: p.number,
    }))))?.pullNumber
  : pulls[0].number;
  if (!selectedPullNumber) {
    return { errorMessage: `No pull of ${pulls.map(p => p.number).join(', ')} has been selected.` };
  }

  return { value: selectedPullNumber };
}

async function getRemoteUrlFrom(gitConfig: any): Promise<Value<string>> {
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
