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

export function parseRemoteUrl(remoteUrl: string | undefined): GitRemote | null {
  if (!remoteUrl) {
    return null;
  }

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

export function getBranch(config: GitConfig, branch: string | null): GitConfigBranch | null {
  if (!branch) {
    return null;
  }

  return config[`branch "${branch}"`] ?? null;
}

const HEAD_FILE_REF_PREFIX = 'ref: ';

type GitHead = {
  ref: string;
} | {
  commit: string;
};

export function parseGitHead(dir: string): GitHead {
  const content = fs.readFileSync(path.join(dir, '.git', 'HEAD'), 'utf-8');

  if (content && content.startsWith(HEAD_FILE_REF_PREFIX)) {
    return {
      ref: content.slice(HEAD_FILE_REF_PREFIX.length),
    };
  } else {
    return {
      commit: content,
    };
  }
}

export const REFS_HEADS_PREFIX = 'refs/heads/';

export function stripRefsHeadsPrefix(ref: string): string | null {
  if (!ref.startsWith(REFS_HEADS_PREFIX)) {
    return null;
  }

  return ref.slice(REFS_HEADS_PREFIX.length).trim();
}
