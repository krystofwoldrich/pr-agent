import * as path from 'path';
import * as fs from 'fs';
import * as ini from 'ini';

export function isGitRepository(dir: string): boolean {
  if (fs.existsSync(path.join(dir, '.git'))) {
    return true;
  }
  return false;
}

export type GitRemote = {
  owner: string;
  name: string;
};

export function parseRemoteUrl(remoteUrl: string): GitRemote | null {
  let [owner, name] = remoteUrl.split(':')[1].split('/');
  name = name.replace('.git', '');

  if (!owner || !name) {
    return null;
  }
  return { owner, name };
}

export type GitConfigBranchKey = `branch "${string}"`;
export type GitConfigRemoteKey = `remote "${string}"`;

export type GitConfig = {
  [key: GitConfigBranchKey]: {
    merge: string;
  };
  [key: GitConfigRemoteKey]: {
    url: string;
  };
};

export type GitConfigBranch = GitConfig[GitConfigBranchKey];
export type GitConfigRemote = GitConfig[GitConfigRemoteKey];

export function parseGitConfig(dir: string) {
  return ini.parse(fs.readFileSync(path.join(dir, '.git', 'config'), 'utf-8'));
}

export function getRemotes(config: GitConfig): GitConfigRemoteKey[] {
  return Object.keys(config).filter(key => key.startsWith('remote ')) as GitConfigRemoteKey[];
}
