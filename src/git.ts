import * as path from 'path';
import * as fs from 'fs';
import * as ini from 'ini';

export function isGitRepository(dir: string): boolean {
  if (fs.existsSync(path.join(dir, '.git'))) {
    return true;
  }
  return false;
}

export function parseRemoteUrl(remoteUrl: string): { owner: string, name: string } | null {
  let [owner, name] = remoteUrl.split(':')[1].split('/');
  name = name.replace('.git', '');

  if (!owner || !name) {
    return null;
  }
  return { owner, name };
}

export function parseGitConfig(dir: string) {
  return ini.parse(fs.readFileSync(path.join(dir, '.git', 'config'), 'utf-8'));
}

// TODO: config type
export function getRemotes(config: any) {
  return Object.keys(config).filter(key => key.startsWith('remote '));
}
