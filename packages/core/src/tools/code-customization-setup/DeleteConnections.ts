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
import { v4 as uuidv4 } from 'uuid';
import { Type } from '@google/genai';
// Import the shared interface
import { LongRunningOperation } from './api-interfaces.js';

/**
 * Parameters for the DeleteConnectionTool.
 */
export interface DeleteConnectionParams {
  /** The Google Cloud project ID. */
  projectId: string;
  /** The Google Cloud location (region). */
  location: string;
  /** The ID of the Developer Connect connection to delete. */
  connectionId: string;

  /** Optional. API environment. Defaults to 'prod'. */
  environment?: 'prod' | 'staging';
  /** Optional. If set, validates the request but does not delete the connection. */
  validateOnly?: boolean;
  /** Optional. A unique UUID for the request. */
  requestId?: string;
  /** Optional. An etag for optimistic concurrency control. */
  etag?: string;
}

/**
 * Result from the DeleteConnectionTool.
 */
export interface DeleteConnectionResult extends ToolResult {
  operation?: LongRunningOperation;
}

/**
 * A tool to delete a Developer Connect Connection.
 */
export class DeleteConnectionTool extends BaseTool<
  DeleteConnectionParams,
  DeleteConnectionResult
> {
  static readonly Name: string = 'delete_connection';
  private auth: GoogleAuth;
  private client: Gaxios;

  constructor(private readonly config: Config) {
    super(
      DeleteConnectionTool.Name,
      'Delete Developer Connect Connection',
      'Deletes a specific Developer Connect connection.',
      {
        type: Type.OBJECT,
        properties: {
          projectId: { type: Type.STRING, description: 'The Google Cloud project ID.' },
          location: { type: Type.STRING, description: 'The Google Cloud location.' },
          connectionId: { type: Type.STRING, description: 'ID of the connection to delete.' },
          environment: { type: Type.STRING, enum: ['prod', 'staging'], default: 'prod' },
          validateOnly: { type: Type.BOOLEAN, description: 'Optional. If true, only validates the request.' },
          requestId: { type: Type.STRING, description: 'Optional. A unique UUID for the request.' },
          etag: { type: Type.STRING, description: 'Optional. An etag for optimistic concurrency control.' },
        },
        required: ['projectId', 'location', 'connectionId'],
      },
    );
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.client = new Gaxios();
  }

  validateParams(params: DeleteConnectionParams): string | null {
    if (!params.projectId?.trim()) return "The 'projectId' parameter is required.";
    if (!params.location?.trim()) return "The 'location' parameter is required.";
    if (!params.connectionId?.trim()) return "The 'connectionId' parameter is required.";
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

  async execute(params: DeleteConnectionParams): Promise<DeleteConnectionResult> {
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
      const resourceName = `projects/${projectId}/locations/${params.location}/connections/${params.connectionId}`;
      
      const urlParams = new URLSearchParams({ alt: 'json' });
      if (params.validateOnly) urlParams.append('validateOnly', 'true');
      if (params.etag) urlParams.append('etag', params.etag);
      urlParams.append('requestId', params.requestId || uuidv4());

      const apiUrl = `${endpoint}/v1/${resourceName}?${urlParams.toString()}`;

      const response = await this.makeRequest<LongRunningOperation>({
        url: apiUrl,
        method: 'DELETE',
        headers,
      });

      const operation = response.data;
      const formattedOutput = `Delete request issued for connection. Operation Name: ${operation.name}`;

      return {
        llmContent: formattedOutput,
        returnDisplay: `Successfully initiated deletion of connection "${params.connectionId}". Operation: ${operation.name}`,
        operation: operation,
      };

    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      let displayError = 'Error deleting connection.';

      if (errorMessage.includes('403')) {
        displayError = 'Error: Permission denied. Ensure the caller has the "roles/developerconnect.connectionAdmin" role.';
      } else if (errorMessage.includes('404')) {
        displayError = `Error: Connection "${params.connectionId}" not found.`;
      } else if (errorMessage.includes('Failed to retrieve access token')) {
        displayError = 'Error: Authentication failed. Please run `gcloud auth login`.';
      } else {
        displayError = `An unexpected error occurred: ${errorMessage}`;
      }

      return {
        llmContent: `Error deleting connection: ${errorMessage}`,
        returnDisplay: displayError,
      };
    }
  }
}