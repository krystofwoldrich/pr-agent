import * as vscode from 'vscode';

export async function getLatestNumbers(
  token: string,
  owner: string,
  repository: string,
): Promise<{
  repository?: {
    discussions?: {
      nodes?: Array<{
        number?: number;
      }>;
    };
    issues?: {
      nodes?: Array<{
        number?: number;
      }>;
    };
    pullRequests?: {
      nodes?: Array<{
        number?: number;
      }>;
    };
  };
} | null> {
  return doRequest(
    {
      query: `query Numbers($name: String!, $owner:String!) {
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
      }`,
      variables: {
        owner,
        name: repository,
      },
    },
    token,
  );
}

export async function getAssociatedPulls(
  token: string,
  owner: string,
  repository: string,
  branch: string,
): Promise<{
  repository: {
    ref: {
      associatedPullRequests: {
        nodes: {
          number: number;
          state: 'OPEN' | 'CLOSED';
          title: string;
          url: string;
        }[];
      };
    };
  };
} | null> {
  return doRequest(
    {
      // Note: qualifiedName matching falls back to simple name if qualified not found
      query: `query AssociatedPulls($owner:String!, $name:String!, $branch:String!){
        repository(owner: $owner, name: $name) {
          ref(qualifiedName: $branch) {
            associatedPullRequests(first: 10, states: OPEN) {
              nodes {
                title
                url
                number
                state
              }
            }
          }
        }
      }`,
      variables: {
        branch,
        owner,
        name: repository,
      },
    },
    token,
  );
}

async function doRequest(body: {
  query: string,
  variables: Record<string, string>,
},
token: string) {
  try {
    const raw = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const json = await raw.json() as { data?: unknown };

    if (!json.data) {
      vscode.window.showErrorMessage('Communication with GitHub API failed.');
      return null;
    }

    return json.data as any;
  } catch (error) {
    if (error instanceof Error) {
      vscode.window.showErrorMessage(error.message);
    } else {
      vscode.window.showErrorMessage('Unknown error');
    }
  }

  return null;
}
