/**
@license
Copyright 2025 Google LLC
SPDX-License-Identifier: Apache-2.0
*/

import { BaseTool, ToolResult } from '../tools.js';
import { Config } from '../../config/config.js';
import { getErrorMessage } from '../../utils/errors.js';
import { GoogleAuth } from 'google-auth-library';
import { GaxiosResponse, Gaxios, GaxiosOptions } from 'gaxios';
import { Type } from '@google/genai';
// Import the shared interface
import { GitRepositoryLink } from './api-interfaces.js';

/**
 * Parameters for the GetGitRepositoryLinkTool.
 */
export interface GetGitRepositoryLinkParams {
  /** The Google Cloud project ID. */
  projectId: string;
  /** The Google Cloud location (region). */
  location: string;
  /** The ID of the parent Developer Connect connection. */
  connectionId: string;
  /** The ID of the repository link to retrieve. */
  gitRepositoryLinkId: string;
  /** Optional. API environment. Defaults to 'prod'. */
  environment?: 'prod' | 'staging';
}

/**
 * Result from the GetGitRepositoryLinkTool.
 */
export interface GetGitRepositoryLinkResult extends ToolResult {
  gitRepositoryLink?: GitRepositoryLink; 
}

/**
 * A tool to get details for a Git Repository Link in Developer Connect.
 */
export class GetGitRepositoryLinkTool extends BaseTool<
  GetGitRepositoryLinkParams,
  GetGitRepositoryLinkResult
> {
  static readonly Name: string = 'get_git_repository_link';
  private auth: GoogleAuth;
  private client: Gaxios;

  constructor(private readonly config: Config) {
    super(
      GetGitRepositoryLinkTool.Name,
      'Get Developer Connect Git Repository Link',
      'Gets details for a specific Git Repository Link in a Developer Connect connection.',
      {
        type: Type.OBJECT,
        properties: {
          projectId: { type: Type.STRING, description: 'The Google Cloud project ID.' },
          location: { type: Type.STRING, description: 'The Google Cloud location.' },
          connectionId: { type: Type.STRING, description: 'ID of the parent connection.' },
          gitRepositoryLinkId: { type: Type.STRING, description: 'The unique ID of the repository link to get.' },
          environment: { type: Type.STRING, enum: ['prod', 'staging'], default: 'prod' },
        },
        required: ['projectId', 'location', 'connectionId', 'gitRepositoryLinkId'],
      },
    );
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.client = new Gaxios();
  }

  validateParams(params: GetGitRepositoryLinkParams): string | null {
    if (!params.projectId?.trim()) return "The 'projectId' parameter is required.";
    if (!params.location?.trim()) return "The 'location' parameter is required.";
    if (!params.connectionId?.trim()) return "The 'connectionId' parameter is required.";
    if (!params.gitRepositoryLinkId?.trim()) return "The 'gitRepositoryLinkId' parameter is required.";
    return null;
  }

  getApiEndpoint(environment: 'prod' | 'staging' = 'prod'): string {
    return environment === 'staging'
      ? 'https://staging-developerconnect.sandbox.googleapis.com'
      : 'https://developerconnect.googleapis.com';
  }

  private async makeRequest<T>(options: GaxiosOptions): Promise<GaxiosResponse<T>> {
    try {
      return await this.client.request<T>(options);
    } catch (error: any) {
      const errorMessage = getErrorMessage(error);
      const statusCode = error.code || error.response?.status;
      throw new Error(`API call failed: ${statusCode} - ${errorMessage}`);
    }
  }
  
  private formatObject(data?: Record<string, string>): string {
      if (!data || Object.keys(data).length === 0) {
          return 'N/A';
      }
      return '\n' + Object.entries(data).map(([key, value]) => `    ${key}: ${value}`).join('\n');
  }

  async execute(params: GetGitRepositoryLinkParams): Promise<GetGitRepositoryLinkResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return { llmContent: `Invalid Parameters: ${validationError}`, returnDisplay: validationError };
    }

    const env = params.environment || 'prod';
    const projectId = params.projectId;

    try {
      const authClient = await this.auth.getClient();
      const token = await authClient.getAccessToken();
      if (!token.token) throw new Error('Failed to retrieve access token.');

      const headers = {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
        'X-Goog-User-Project': projectId,
      };

      const endpoint = this.getApiEndpoint(env);
      const resourceName = `projects/${projectId}/locations/${params.location}/connections/${params.connectionId}/gitRepositoryLinks/${params.gitRepositoryLinkId}`;
      const apiUrl = `${endpoint}/v1/${resourceName}?alt=json`;

      const response = await this.makeRequest<GitRepositoryLink>({
        url: apiUrl,
        method: 'GET',
        headers,
      });
      
      const link = response.data;
      const formattedOutput = `Git Repository Link Details:
  Name: ${link.name}
  UID: ${link.uid || 'N/A'}
  Clone URI: ${link.cloneUri}
  Created: ${link.createTime || 'N/A'}
  Updated: ${link.updateTime || 'N/A'}
  Reconciling: ${link.reconciling || false}
  Etag: ${link.etag || 'N/A'}
  Labels: ${this.formatObject(link.labels)}
  Annotations: ${this.formatObject(link.annotations)}`;

      return {
        llmContent: formattedOutput,
        returnDisplay: `Successfully retrieved details for Git Repository Link "${params.gitRepositoryLinkId}".`,
        gitRepositoryLink: link,
      };

    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      let displayError = 'Error getting Git Repository Link.';

      if (errorMessage.includes('403')) {
        displayError = 'Error: Permission denied. Ensure the caller has the "roles/developerconnect.viewer" role.';
      } else if (errorMessage.includes('404')) {
        displayError = `Error: Git Repository Link "${params.gitRepositoryLinkId}" not found.`;
      } else if (errorMessage.includes('Failed to retrieve access token')) {
        displayError = 'Error: Authentication failed. Please run `gcloud auth login`.';
      } else {
        displayError = `An unexpected error occurred: ${errorMessage}`;
      }

      return {
        llmContent: `Error getting Git Repository Link: ${errorMessage}`,
        returnDisplay: displayError,
      };
    }
  }
}