import * as path from 'path';
import * as vscode from 'vscode';

import { getRemotes, isGitRepository, parseGitConfig, parseRemoteUrl } from './git';
import { clearGithubToken, getGithubToken } from './secrets';
import { GitHubResponse, getLatestNumbers } from './api';
import { getMarkDownTemplate } from './template';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'pr-agent.nextPullLink',
      () => nextPullLink(context),
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

async function nextPullLink(context: vscode.ExtensionContext) {
  const cursor = vscode.window.activeTextEditor?.selection.active;
  if (!cursor) {
    return;
  }

  const currentlyOpenTabFilePath = vscode.window.activeTextEditor?.document.fileName;
  if (!currentlyOpenTabFilePath) {
    vscode.window.showErrorMessage('Could not find currently open file path and thus detect GitHub repository and the next PR number.');
    return;
  }

  const dirName = path.dirname(currentlyOpenTabFilePath);
  if (!isGitRepository(dirName)) {
    vscode.window.showErrorMessage('Could not find GitHub repository and thus the next PR number.');
    return;
  }

  const gitConfig = parseGitConfig(dirName);
  const gitRemotes = getRemotes(gitConfig);

  const selectedRemoteKey = gitRemotes.length !== 1
    ? await vscode.window.showQuickPick(gitRemotes)
    : gitRemotes[0];
  if (!selectedRemoteKey) {
    vscode.window.showErrorMessage('No remote selected.');
    return;
  }

  const remoteUrl = gitConfig[selectedRemoteKey].url;
  if (!remoteUrl) {
    vscode.window.showErrorMessage('No remote URL found.');
    return;
  }

  const parsedRemoteUrl = parseRemoteUrl(remoteUrl);
  if (!parsedRemoteUrl) {
    vscode.window.showErrorMessage('Could not parse remote URL.');
    return;
  }

  const token = await getGithubToken(context.secrets);
  const data = await getLatestNumbers(token, parsedRemoteUrl.owner, parsedRemoteUrl.name);
  if (!data) {
    return;
  }

  const current = getCurrentLatestNumber(data);
  const next = current + 1;
  vscode.window.activeTextEditor?.edit(editBuilder => {
    editBuilder.insert(cursor, getMarkDownTemplate(next, parsedRemoteUrl.owner, parsedRemoteUrl.name));
  });
}

function getCurrentLatestNumber(data: GitHubResponse['data']) {
  return Math.max(
    data.repository?.discussions?.nodes?.[0]?.number || 0,
    data.repository?.issues?.nodes?.[0]?.number || 0,
    data.repository?.pullRequests?.nodes?.[0]?.number || 0,
  );
}