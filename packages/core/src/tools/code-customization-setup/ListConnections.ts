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
// Import the new shared interface
import { Connection } from './api-interfaces.js';

// --- LOCAL INTERFACES ---
// This interface is specific to the API response for this tool.
interface ListConnectionsResponse {
  connections?: Connection[];
  nextPageToken?: string;
  unreachable?: string[];
}

/**
 * Parameters for the ListConnectionsTool.
 */
export interface ListConnectionsParams {
  /** The Google Cloud location (region). */
  location: string;
  /** The Google Cloud project ID. */
  projectId: string;

  /** Optional. Number of items to fetch per page. */
  pageSize?: number;
  /** Optional. API environment. Defaults to 'prod'. */
  environment?: 'prod' | 'staging';
  /** Optional. Filter string (AIP-160). */
  filter?: string;
  /** Optional. Order by string (AIP-132). */
  orderBy?: string;
}

/**
 * Result from the ListConnectionsTool.
 */
export interface ListConnectionsResult extends ToolResult {
  connections?: Connection[];
}

/**
 * A tool to list all Connections in a project and location.
 */
export class ListConnectionsTool extends BaseTool<
  ListConnectionsParams,
  ListConnectionsResult
> {
  static readonly Name: string = 'list_connections';
  private auth: GoogleAuth;
  private client: Gaxios;

  constructor(private readonly config: Config) {
    super(
      ListConnectionsTool.Name,
      'List Developer Connect Connections',
      'Lists all Developer Connect connections within a specific project and location.',
      {
        type: Type.OBJECT,
        properties: {
          location: { type: Type.STRING, description: 'The Google Cloud location.' },
          projectId: { type: Type.STRING, description: 'The Google Cloud project ID.' },
          pageSize: { type: Type.INTEGER, description: 'Optional. Number of items per page.' },
          environment: { type: Type.STRING, enum: ['prod', 'staging'], default: 'prod' },
          filter: { type: Type.STRING, description: 'Optional. Filter expression (AIP-160).' },
          orderBy: { type: Type.STRING, description: 'Optional. Order by expression (AIP-132).' },
        },
        required: ['location', 'projectId'],
      },
    );

    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.client = new Gaxios();
  }

  validateParams(params: ListConnectionsParams): string | null {
    if (!params.location?.trim()) return "The 'location' parameter is required.";
    if (!params.projectId?.trim()) return "The 'projectId' parameter is required.";
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

  async execute(params: ListConnectionsParams): Promise<ListConnectionsResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
        return { llmContent: `Invalid Parameters: ${validationError}`, returnDisplay: validationError };
    }

    const env = params.environment || 'prod';
    const projectId = params.projectId;
    const pageSize = params.pageSize || 50;

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
      const parentName = `projects/${projectId}/locations/${params.location}`;
      const baseApiUrl = `${endpoint}/v1/${parentName}/connections`;

      let allConnections: Connection[] = [];
      let pageToken: string | undefined = undefined;

      do {
        const urlParams = new URLSearchParams({ pageSize: pageSize.toString(), alt: 'json' });
        if (pageToken) urlParams.append('pageToken', pageToken);
        if (params.filter) urlParams.append('filter', params.filter);
        if (params.orderBy) urlParams.append('orderBy', params.orderBy);

        const apiUrl = `${baseApiUrl}?${urlParams.toString()}`;
        const response = await this.makeRequest<ListConnectionsResponse>({
            url: apiUrl,
            method: 'GET',
            headers,
        });
        
        if (response.data.connections) {
            allConnections = allConnections.concat(response.data.connections);
        }
        pageToken = response.data.nextPageToken;

      } while (pageToken);

      const formattedOutput = allConnections.length > 0
        ? allConnections.map((conn, i) => {
            const provider = Object.keys(conn).find(k => k.endsWith('Config')) || 'N/A';
            return `Connection ${i + 1}:
  Name: ${conn.name}
  Provider: ${provider.replace('Config', '')}
  Created: ${conn.createTime || 'N/A'}
  Disabled: ${conn.disabled || false}`;
          }).join('\n\n')
        : 'No connections found.';

      return {
        llmContent: `Connections Found:\n\n${formattedOutput}`,
        returnDisplay: `Successfully listed ${allConnections.length} connection(s).`,
        connections: allConnections,
      };

    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      let displayError = 'Error listing connections.';

      if (errorMessage.includes('403')) {
        displayError = 'Error: Permission denied. Ensure the caller has the role "roles/developerconnect.viewer".';
      } else if (errorMessage.includes('404')) {
        displayError = `Error: Resources not found for project "${params.projectId}" in location "${params.location}".`;
      } else if (errorMessage.includes('Failed to retrieve access token')) {
        displayError = 'Error: Authentication failed. Please run \`gcloud auth login\`.';
      } else {
        displayError = `An unexpected error occurred: ${errorMessage}`;
      }

      return {
        llmContent: `Error listing connections: ${errorMessage}`,
        returnDisplay: displayError,
      };
    }
  }
}