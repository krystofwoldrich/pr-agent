
export function getMarkDownTemplate(next: number, owner: string, name: string) {
  return `([#${next}](https://github.com/${owner}/${name}/pull/${next}))`;
}
