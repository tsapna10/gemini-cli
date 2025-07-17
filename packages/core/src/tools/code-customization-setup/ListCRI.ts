/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from '../tools.js';
import { Config } from '../../config/config.js';
import { getErrorMessage } from '../../utils/errors.js';
import { GoogleAuth } from 'google-auth-library';
import { GaxiosResponse, Gaxios, GaxiosOptions } from 'gaxios';
import { Type } from '@google/genai';
import { CodeRepositoryIndex, RepositoryGroup } from './api-interfaces.js';

// Import the tool to be reused
import {
  ListRepositoryGroupsTool,
} from './ListGroups.js';

// --- LOCAL INTERFACES ---
// These are specific to this tool's functionality and responses.

interface ListCodeRepositoryIndexesResponse {
  codeRepositoryIndexes?: CodeRepositoryIndex[];
  nextPageToken?: string;
}

interface CRIWithGroups extends CodeRepositoryIndex {
  groups: RepositoryGroup[];
  groupsError?: string;
}

/**
 * Parameters for the ListCRITool.
 */
export interface ListCRIParams {
  projectId: string;
  location: string;
  pageSize?: number;
  environment?: 'prod' | 'staging';
  listGroups?: boolean;
}

/**
 * Result from the ListCRITool.
 */
export interface ListCRIResult extends ToolResult {
  indexesWithGroups?: CRIWithGroups[];
}

/**
 * A tool to list Code Repository Indexes and, optionally, their associated Repository Groups.
 */
export class ListCRITool extends BaseTool<ListCRIParams, ListCRIResult> {
  static readonly Name: string = 'list_code_repository_indexes_and_groups';
  private auth: GoogleAuth;
  private client: Gaxios;
  // Hold an instance of the other tool for reuse
  private listRepositoryGroupsTool: ListRepositoryGroupsTool;

  constructor(private readonly config: Config) {
    super(
      ListCRITool.Name,
      'List Code Repository Indexes',
      'Lists Code Repository Indexes for a project and location, and optionally lists the Repository Groups within each index.',
      {
        type: Type.OBJECT,
        properties: {
          projectId: {
            type: Type.STRING,
            description: 'The Google Cloud project ID.',
          },
          location: {
            type: Type.STRING,
            description: 'The Google Cloud location (region).',
          },
          pageSize: {
            type: Type.INTEGER,
            description:
              'Optional. Number of items to fetch per page for both indexes and groups.',
            default: 50,
          },
          environment: {
            type: Type.STRING,
            description:
              "Optional. API environment to use ('prod' or 'staging'). Defaults to 'staging'.",
            enum: ['prod', 'staging'],
            default: 'staging',
          },
          listGroups: {
            type: Type.BOOLEAN,
            description:
              'Optional. Whether to fetch the Repository Groups for each index. Defaults to true.',
            default: true,
          },
        },
        required: ['projectId', 'location'],
      },
    );

    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.client = new Gaxios();
    // Instantiate the repository group lister tool
    this.listRepositoryGroupsTool = new ListRepositoryGroupsTool(config);
  }

  getDescription(params: ListCRIParams): string {
    return `Listing code repository indexes ${params.listGroups !== false ? 'and their groups ' : ''}for project ${params.projectId} in ${params.location} (env: ${params.environment || 'staging'})...`;
  }

  getApiEndpoint(environment: 'prod' | 'staging' = 'staging'): string {
    return environment === 'prod'
      ? 'https://cloudaicompanion.googleapis.com'
      : 'https://staging-cloudaicompanion.sandbox.googleapis.com';
  }

  private async makeRequest<T>(
    options: GaxiosOptions,
  ): Promise<GaxiosResponse<T>> {
    try {
      return await this.client.request<T>(options);
    } catch (error: any) {
      const errorMessage = getErrorMessage(error);
      const statusCode = error.code || error.response?.status;
      throw new Error(
        `API call to ${options.url} failed: ${statusCode} - ${errorMessage} ${JSON.stringify(error.response?.data)}`,
      );
    }
  }

  async execute(params: ListCRIParams): Promise<ListCRIResult> {
    if (!params.projectId?.trim() || !params.location?.trim()) {
      return {
        llmContent: 'Project ID and Location are required.',
        returnDisplay: 'Error: Project ID and Location must be provided.',
      };
    }

    const env = params.environment || 'staging';
    const listGroups = params.listGroups !== false;

    try {
      const authClient = await this.auth.getClient();
      const token = await authClient.getAccessToken();
      if (!token.token) {
        throw new Error('Failed to retrieve access token.');
      }

      const headers = {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
        'X-Goog-User-Project': params.projectId,
      };

      const endpoint = this.getApiEndpoint(env);
      const allIndexes = await this.fetchAllIndexes(params, headers, endpoint);

      const indexesWithGroups: CRIWithGroups[] = [];
      for (const index of allIndexes) {
        const indexWithGroups: CRIWithGroups = { ...index, groups: [] };

        if (listGroups) {
          const indexId = index.name.split('/').pop();
          if (!indexId) {
            indexWithGroups.groupsError = 'Could not parse indexId from resource name.';
            indexesWithGroups.push(indexWithGroups);
            continue;
          }

          console.log(`Fetching groups for index: ${indexId}`);
          
          const groupResult = await this.listRepositoryGroupsTool.execute({
            projectId: params.projectId,
            location: params.location,
            indexId: indexId,
            environment: env,
            pageSize: params.pageSize,
          });

          if (groupResult.repositoryGroups) {
            indexWithGroups.groups = groupResult.repositoryGroups;
          } else {
            if (typeof groupResult.returnDisplay === 'string') {
              indexWithGroups.groupsError = groupResult.returnDisplay;
            } else {
              indexWithGroups.groupsError = `An unexpected error object was returned when fetching groups.`;
            }
            console.error(`Error fetching groups for ${index.name}:`, groupResult.returnDisplay);
          }
        }
        indexesWithGroups.push(indexWithGroups);
      }

      const formattedOutput = this.formatOutput(indexesWithGroups, listGroups);

      return {
        llmContent: formattedOutput,
        returnDisplay: `Successfully listed ${allIndexes.length} index(es) from ${env}.${listGroups ? ' Fetched group details.' : ''}`,
        indexesWithGroups,
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error(`Error in ListCRITool: ${errorMessage}`);
      let displayError = 'Error listing code repository indexes.';
      if (
        errorMessage.includes('PERMISSION_DENIED') ||
        errorMessage.includes('403')
      ) {
        displayError =
          'Error: Permission denied. Ensure the caller has the necessary IAM roles (cloudaicompanion.codeRepositoryIndexes.list and cloudaicompanion.repositoryGroups.list) on the project.';
      } else if (
        errorMessage.includes('NOT_FOUND') ||
        errorMessage.includes('404')
      ) {
        displayError = `Error: API endpoint not found or resource not found in ${env}. Check project, location, and API enablement for the *staging* API.`;
      } else if (errorMessage.includes('enable the API')) {
        displayError = `Error: Cloud AI Companion API (Staging) is not enabled. Please enable ${this.getApiEndpoint(env).replace('https://', '')} in the Google Cloud Console for project ${params.projectId}.`;
      } else if (
        errorMessage.includes('Failed to retrieve access token') ||
        errorMessage.includes('Could not refresh access token')
      ) {
        displayError =
          'Error: Authentication failed. Please run `gcloud auth login` and `gcloud auth application-default login`.';
      } else if (errorMessage.includes('API call to')) {
        displayError = errorMessage;
      } else {
        displayError = `Error listing resources: ${errorMessage}`;
      }
      
      return {
        llmContent: `Error listing resources: ${errorMessage}`,
        returnDisplay: displayError,
      };
    }
  }
  
  private async fetchAllIndexes(params: ListCRIParams, headers: Record<string, string>, endpoint: string): Promise<CodeRepositoryIndex[]> {
    let allIndexes: CodeRepositoryIndex[] = [];
    let pageToken: string | undefined = undefined;
    const baseIndexesUrl = `${endpoint}/v1/projects/${params.projectId}/locations/${params.location}/codeRepositoryIndexes`;
    
    console.log(`Listing Indexes from: ${baseIndexesUrl}`);
    
    do {
      const urlParams = new URLSearchParams();
      urlParams.append('pageSize', (params.pageSize || 50).toString());
      if (pageToken) urlParams.append('pageToken', pageToken);
      urlParams.append('alt', 'json');

      const apiUrl = `${baseIndexesUrl}?${urlParams.toString()}`;
      const response = await this.makeRequest<ListCodeRepositoryIndexesResponse>({
          url: apiUrl,
          method: 'GET',
          headers,
      });

      if (response.data.codeRepositoryIndexes) {
        allIndexes = allIndexes.concat(response.data.codeRepositoryIndexes);
      }
      pageToken = response.data.nextPageToken;
    } while (pageToken);

    console.log(`Total indexes fetched: ${allIndexes.length}`);
    return allIndexes;
  }

  private formatOutput(indexesWithGroups: CRIWithGroups[], listGroups: boolean): string {
    if (indexesWithGroups.length === 0) {
        return 'No code repository indexes found.';
    }

    const output = indexesWithGroups.map((iwg, i) => {
        let indexStr = `Index ${i + 1}:\n  Name: ${iwg.name}\n  State: ${iwg.state}`;
        if (listGroups) {
            if (iwg.groupsError) {
                indexStr += `\n  Groups Error: ${iwg.groupsError}`;
            } else {
                indexStr += `\n  Groups (${iwg.groups.length}):`;
                if (iwg.groups.length > 0) {
                    indexStr += '\n' + iwg.groups.map((g, j) => {
                        let groupStr = `    Group ${j + 1}: ${g.name}`;
                        if (g.repositories && g.repositories.length > 0) {
                            groupStr += `\n      Repositories:\n` + g.repositories.map(r => 
                                `        - ${r.resource} (Branch: ${r.branchPattern || 'N/A'})`
                            ).join('\n');
                        } else {
                            groupStr += `\n      Repositories: None`;
                        }
                        return groupStr;
                    }).join('\n');
                } else {
                    indexStr += ' None';
                }
            }
        }
        return indexStr;
    }).join('\n\n');

    return `Code Repository Indexes Found:\n\n${output}`;
  }
}