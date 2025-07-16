/**
@license
Copyright 2025 Google LLC
SPDX-License-Identifier: Apache-2.0
*/

import { BaseTool, ToolResult } from './tools.js';
import { Config } from '../config/config.js';
import { getErrorMessage } from '../utils/errors.js';
import { GoogleAuth } from 'google-auth-library';
import { GaxiosResponse, Gaxios, GaxiosOptions } from 'gaxios';
import { v4 as uuidv4 } from 'uuid';
import { Type } from '@google/genai';

// Interface for the long-running operation response
interface Operation {
  name: string;
  metadata?: any;
  done: boolean;
  error?: {
    code: number;
    message: string;
    details?: any[];
  };
  response?: any;
}

/**
 * Parameters for the DeleteGitRepositoryLinkTool.
 */
export interface DeleteGitRepositoryLinkParams {
  /** The Google Cloud project ID. */
  projectId: string;
  /** The Google Cloud location (region). */
  location: string;
  /** The ID of the parent Developer Connect connection. */
  connectionId: string;
  /** The ID of the repository link to delete. */
  gitRepositoryLinkId: string;

  /** Optional. API environment. Defaults to 'prod'. */
  environment?: 'prod' | 'staging';
  /** Optional. If set, validates the request, but do not actually delete the link. */
  validateOnly?: boolean;
  /** Optional. An optional request ID to identify requests. */
  requestId?: string;
  /** Optional. This checksum is computed by the server based on the value of other fields. */
  etag?: string;
}

/**
 * Result from the DeleteGitRepositoryLinkTool.
 */
export interface DeleteGitRepositoryLinkResult extends ToolResult {
  /** The name of the long-running operation resource. */
  operationName?: string;
}

/**
 * A tool to delete a new Git Repository Link in Developer Connect.
 */
export class DeleteGitRepositoryLinkTool extends BaseTool<
  DeleteGitRepositoryLinkParams,
  DeleteGitRepositoryLinkResult
> {
  static readonly Name: string = 'delete_git_repository_link';
  private auth: GoogleAuth;
  private client: Gaxios;

  constructor(private readonly config: Config) {
    super(
      DeleteGitRepositoryLinkTool.Name,
      'Delete Developer Connect Git Repository Link',
      'Deletes a Git Repository Link from a specific Developer Connect connection.',
      {
        type: Type.OBJECT,
        properties: {
          projectId: { type: Type.STRING, description: 'The Google Cloud project ID.' },
          location: { type: Type.STRING, description: 'The Google Cloud location.' },
          connectionId: { type: Type.STRING, description: 'ID of the parent connection.' },
          gitRepositoryLinkId: { type: Type.STRING, description: 'The unique ID of the repository link to delete.' },
          environment: { type: Type.STRING, enum: ['prod', 'staging'], default: 'prod' },
          validateOnly: { type: Type.BOOLEAN, description: 'Optional. If true, only validates the request.' },
          requestId: { type: Type.STRING, description: 'Optional. A unique UUID for the request.'},
          etag: { type: Type.STRING, description: 'Optional. An etag for optimistic concurrency control.'},
        },
        required: ['projectId', 'location', 'connectionId', 'gitRepositoryLinkId'],
      },
    );
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.client = new Gaxios();
  }

  validateParams(params: DeleteGitRepositoryLinkParams): string | null {
    if (!params.projectId?.trim()) return "The 'projectId' parameter is required.";
    if (!params.location?.trim()) return "The 'location' parameter is required.";
    if (!params.connectionId?.trim()) return "The 'connectionId' parameter is required.";
    if (!params.gitRepositoryLinkId?.trim()) return "The 'gitRepositoryLinkId' parameter is required.";
    if (params.requestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.requestId)) {
        return "The 'requestId' parameter must be a valid UUID.";
    }
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

  async execute(params: DeleteGitRepositoryLinkParams): Promise<DeleteGitRepositoryLinkResult> {
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
      
      const urlParams = new URLSearchParams({ alt: 'json' });
      if (params.validateOnly) urlParams.append('validateOnly', 'true');
      if (params.etag) urlParams.append('etag', params.etag);
      urlParams.append('requestId', params.requestId || uuidv4());

      const apiUrl = `${endpoint}/v1/${resourceName}?${urlParams.toString()}`;

      const response = await this.makeRequest<Operation>({
        url: apiUrl,
        method: 'DELETE',
        headers,
      });

      const operation = response.data;
      const formattedOutput = `Delete request issued for Git Repository Link. Operation Name: ${operation.name}`;

      return {
        llmContent: formattedOutput,
        returnDisplay: `Successfully initiated deletion of Git Repository Link "${params.gitRepositoryLinkId}".`,
        operationName: operation.name,
      };

    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      let displayError = 'Error deleting Git Repository Link.';

      if (errorMessage.includes('403')) {
        displayError = 'Error: Permission denied. Ensure the caller has the "roles/developerconnect.editor" role.';
      } else if (errorMessage.includes('404')) {
        displayError = `Error: Git Repository Link "${params.gitRepositoryLinkId}" not found.`;
      } else if (errorMessage.includes('Failed to retrieve access token')) {
        displayError = 'Error: Authentication failed. Please run `gcloud auth login`.';
      } else {
        displayError = `An unexpected error occurred: ${errorMessage}`;
      }

      return {
        llmContent: `Error deleting Git Repository Link: ${errorMessage}`,
        returnDisplay: displayError,
      };
    }
  }
}