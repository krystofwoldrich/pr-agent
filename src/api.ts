import * as vscode from 'vscode';

export async function getLatestNumbers(
  token: string,
  owner: string,
  name: string,
): Promise<GitHubResponse['data'] | null> {
  const query = `query Numbers($name: String!, $owner:String!) {
    repository(
      name: $name,
      owner: $owner) {
      discussions(orderBy: {field:CREATED_AT, direction:DESC}, first: 1){
        nodes {
          number
        }
      }
      issues(orderBy: {field:CREATED_AT, direction:DESC}, first: 1){
        nodes {
          number
        }
      }
      pullRequests(orderBy: {field:CREATED_AT, direction:DESC}, first: 1){
        nodes {
          number
        }
      }
    }
  }`;

  try {
    const raw = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `bearer ${token}`,
      },
      body: JSON.stringify({
        query,
        variables: {
          owner,
          name,
        },
      }),
    });

    const json = await raw.json() as GitHubResponse;

    if (!json.data) {
      vscode.window.showErrorMessage('Could not find GitHub repository and thus the next PR number.');
      return null;
    }

    return json.data;
  } catch (error) {
    if (error instanceof Error) {
      vscode.window.showErrorMessage(error.message);
    } else {
      vscode.window.showErrorMessage('Unknown error');
    }
  }

  return null;
}

export interface GitHubResponse {
  data: {
    repository?: {
      discussions?: {
        nodes?: Array<{
          number?: number,
        }>,
      },
      issues?: {
        nodes?: Array<{
          number?: number,
        }>,
      },
      pullRequests?: {
        nodes?: Array<{
          number?: number,
        }>,
      },
    },
  },
}
