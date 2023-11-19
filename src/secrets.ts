import * as vscode from 'vscode';

export const GH_TOKEN = 'github_token';

async function storeGitHubToken(secrets: vscode.SecretStorage) {
  const token = await vscode.window.showInputBox({
    placeHolder: 'GitHub Personal Access Token',
  });
  if (!token) {
    return;
  }
  await secrets.store(GH_TOKEN, token);
}

export async function getGithubToken(secret: vscode.SecretStorage) {
  const token = await secret.get(GH_TOKEN);
  if (!token) {
    await storeGitHubToken(secret);
    return getGithubToken(secret);
  }
  return token;
}

export async function clearGithubToken(secret: vscode.SecretStorage) {
  await secret.delete(GH_TOKEN);
}
