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

export type GitConfig = {
  [key: `branch "${string}"`]: {
    merge: string;
  };
  [key: `remote "${string}"`]: {
    url: string;
  };
};

export type GitConfigBranch = GitConfig['branch "branch-name"'];
export type GitConfigRemote = GitConfig['remote "remote-name"'];

export function parseGitConfig(dir: string) {
  return ini.parse(fs.readFileSync(path.join(dir, '.git', 'config'), 'utf-8'));
}

export function getRemotes(config: GitConfig) {
  return Object.keys(config).filter(key => key.startsWith('remote '));
}
