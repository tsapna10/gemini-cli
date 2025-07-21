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
// Import the shared interface
import { Connection } from './api-interfaces.js';

/**
 * Parameters for the GetConnectionTool.
 */
export interface GetConnectionParams {
  /** The Google Cloud project ID. */
  projectId: string;
  /** The Google Cloud location (region). */
  location: string;
  /** The ID of the Developer Connect connection to retrieve. */
  connectionId: string;
  /** Optional. API environment. Defaults to 'prod'. */
  environment?: 'prod' | 'staging';
}

/**
 * Result from the GetConnectionTool.
 */
export interface GetConnectionResult extends ToolResult {
  connection?: Connection;
}

/**
 * A tool to get details for a single Developer Connect Connection.
 */
export class GetConnectionTool extends BaseTool<
  GetConnectionParams,
  GetConnectionResult
> {
  static readonly Name: string = 'get_connection';
  private auth: GoogleAuth;
  private client: Gaxios;

  constructor(private readonly config: Config) {
    super(
      GetConnectionTool.Name,
      'Get Developer Connect Connection',
      'Gets details for a specific Developer Connect connection.',
      {
        type: Type.OBJECT,
        properties: {
          projectId: { type: Type.STRING, description: 'The Google Cloud project ID.' },
          location: { type: Type.STRING, description: 'The Google Cloud location.' },
          connectionId: { type: Type.STRING, description: 'ID of the connection to retrieve.' },
          environment: { type: Type.STRING, enum: ['prod', 'staging'], default: 'prod' },
        },
        required: ['projectId', 'location', 'connectionId'],
      },
    );
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.client = new Gaxios();
  }

  validateParams(params: GetConnectionParams): string | null {
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
  
  private formatObject(data?: Record<string, string>): string {
      if (!data || Object.keys(data).length === 0) {
          return 'N/A';
      }
      return '\n' + Object.entries(data).map(([key, value]) => `    ${key}: ${value}`).join('\n');
  }

  async execute(params: GetConnectionParams): Promise<GetConnectionResult> {
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
      const apiUrl = `${endpoint}/v1/${resourceName}?alt=json`;

      const response = await this.makeRequest<Connection>({
        url: apiUrl,
        method: 'GET',
        headers,
      });
      
      const conn = response.data;
      const provider = Object.keys(conn).find(k => k.endsWith('Config')) || 'N/A';
      
      const formattedOutput = `Connection Details:
  Name: ${conn.name}
  UID: ${conn.uid || 'N/A'}
  Provider: ${provider.replace('Config', '')}
  Created: ${conn.createTime || 'N/A'}
  Updated: ${conn.updateTime || 'N/A'}
  Reconciling: ${conn.reconciling || false}
  Disabled: ${conn.disabled || false}
  Etag: ${conn.etag || 'N/A'}
  Labels: ${this.formatObject(conn.labels)}`;

      return {
        llmContent: formattedOutput,
        returnDisplay: `Successfully retrieved details for connection "${params.connectionId}".`,
        connection: conn,
      };

    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      let displayError = 'Error getting connection.';

      if (errorMessage.includes('403')) {
        displayError = 'Error: Permission denied. Ensure the caller has the "roles/developerconnect.viewer" role.';
      } else if (errorMessage.includes('404')) {
        displayError = `Error: Connection "${params.connectionId}" not found.`;
      } else if (errorMessage.includes('Failed to retrieve access token')) {
        displayError = 'Error: Authentication failed. Please run `gcloud auth login`.';
      } else {
        displayError = `An unexpected error occurred: ${errorMessage}`;
      }

      return {
        llmContent: `Error getting connection: ${errorMessage}`,
        returnDisplay: displayError,
      };
    }
  }
}