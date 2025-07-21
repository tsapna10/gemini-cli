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
import {
  Connection,
  LongRunningOperation,
  GitHubConfig,
  GitHubEnterpriseConfig,
  GitLabConfig,
} from './api-interfaces.js';

/**
 * Parameters for the CreateConnectionTool.
 */
export interface CreateConnectionParams {
  projectId: string;
  location: string;
  connectionId: string;
  labels?: Record<string, string>;
  disabled?: boolean;
  githubConfig?: GitHubConfig;
  githubEnterpriseConfig?: GitHubEnterpriseConfig;
  gitlabConfig?: GitLabConfig;
  environment?: 'prod' | 'staging';
  requestId?: string;
  validateOnly?: boolean;
}

/**
 * Result from the CreateConnectionTool.
 */
export interface CreateConnectionResult extends ToolResult {
  operation?: LongRunningOperation;
}

/**
 * A tool to create a new Developer Connect Connection.
 */
export class CreateConnectionTool extends BaseTool<
  CreateConnectionParams,
  CreateConnectionResult
> {
  static readonly Name: string = 'create_connection';
  private auth: GoogleAuth;
  private client: Gaxios;

  constructor(private readonly config: Config) {
    super(
      CreateConnectionTool.Name,
      'Create Developer Connect Connection',
      'Creates a new Developer Connect connection for a specific provider (e.g., GitHub, GitLab).',
      { 
        type: Type.OBJECT,
    properties: {
        projectId: { type: Type.STRING, description: 'The Google Cloud project ID.' },
        location: { type: Type.STRING, description: 'The Google Cloud location.' },
        connectionId: { type: Type.STRING, description: 'The unique ID for the new connection.' },
        labels: { type: Type.OBJECT, description: 'Optional. Labels for the connection.' },
        disabled: { type: Type.BOOLEAN, description: 'Optional. If true, the connection is created in a disabled state.'},
        githubConfig: {
        type: Type.OBJECT,
        description: 'Configuration for a basic GitHub connection. Auth is completed in the UI.',
        properties: {
            githubApp: { type: Type.STRING, enum: ['DEVELOPER_CONNECT', 'FIREBASE'], description: "The Google-owned GitHub App to use."},
            appInstallationId: { type: Type.STRING, description: "Optional. The installation ID of the GitHub App."}
        },
        required: ['githubApp'],
        },
          githubEnterpriseConfig: {
            type: Type.OBJECT,
            description: 'Configuration for connecting to a self-hosted GitHub Enterprise instance.',
            properties: {
                hostUri: { type: Type.STRING, description: "The URI of the GitHub Enterprise host."},
                appId: { type: Type.STRING, description: "The ID of the GitHub App created on the enterprise instance."},
                privateKeySecretVersion: { type: Type.STRING, description: "Secret Manager resource for the app's private key."},
                webhookSecretSecretVersion: { type: Type.STRING, description: "Secret Manager resource for the webhook secret."},
                appInstallationId: { type: Type.STRING, description: "The installation ID of the GitHub App on the enterprise instance."}
            }
          },
          gitlabConfig: {
            type: Type.OBJECT,
            description: 'Configuration for connecting to gitlab.com.',
            properties: {
                webhookSecretSecretVersion: { type: Type.STRING, description: "Secret Manager resource for the webhook secret."},
                readAuthorizerCredential: { type: Type.OBJECT, properties: { userTokenSecretVersion: { type: Type.STRING, description: "Secret Manager resource for a personal access token with read_api scope."}}},
                authorizerCredential: { type: Type.OBJECT, properties: { userTokenSecretVersion: { type: Type.STRING, description: "Secret Manager resource for a personal access token with api scope."}}}
            }
          },
          environment: { type: Type.STRING, enum: ['prod', 'staging'], default: 'prod', description: "Optional. The API environment to use." },
          requestId: { type: Type.STRING, description: 'Optional. A unique UUID to ensure idempotency.' },
          validateOnly: { type: Type.BOOLEAN, description: 'Optional. If true, validates the request without creating the resource.' },
        },
        required: ['projectId', 'location', 'connectionId'],
      },
    );
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.client = new Gaxios();
  }

  validateParams(params: CreateConnectionParams): string | null {
    if (!params.projectId?.trim()) return "The 'projectId' parameter is required.";
    if (!params.location?.trim()) return "The 'location' parameter is required.";
    if (!params.connectionId?.trim()) return "The 'connectionId' parameter is required.";

    const providerConfigs = [
        params.githubConfig, 
        params.githubEnterpriseConfig,
        params.gitlabConfig,
    ].filter(Boolean).length;

    if (providerConfigs === 0) {
        return 'One provider configuration (e.g., githubConfig, gitlabConfig) must be specified.';
    }
    if (providerConfigs > 1) {
        return 'Only one provider configuration can be specified at a time.';
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

  async execute(params: CreateConnectionParams): Promise<CreateConnectionResult> {
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
      const parentName = `projects/${projectId}/locations/${params.location}`;
      const baseApiUrl = `${endpoint}/v1/${parentName}/connections`;

      const urlParams = new URLSearchParams({
          connectionId: params.connectionId,
          requestId: params.requestId || uuidv4(),
          alt: 'json',
      });
      if (params.validateOnly) urlParams.append('validateOnly', 'true');

      const apiUrl = `${baseApiUrl}?${urlParams.toString()}`;
      
      const requestBody: Partial<Connection> = {
          labels: params.labels,
          disabled: params.disabled,
          githubConfig: params.githubConfig,
          githubEnterpriseConfig: params.githubEnterpriseConfig,
          gitlabConfig: params.gitlabConfig,
      };

      const response = await this.makeRequest<LongRunningOperation>({
        url: apiUrl,
        method: 'POST',
        headers,
        data: requestBody,
      });

      const operation = response.data;
      return {
        llmContent: `Connection creation started. Operation Name: ${operation.name}`,
        returnDisplay: `Successfully initiated creation for connection "${params.connectionId}". Operation: ${operation.name} Finish the authentication in the cloud console ui`,
        operation: operation,
      };

    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      let displayError = 'Error creating connection.';

      if (errorMessage.includes('403')) {
        displayError = 'Error: Permission denied. Ensure the caller has the "roles/developerconnect.connectionAdmin" role.';
      } else if (errorMessage.includes('409')) {
        displayError = `Error: A connection with ID "${params.connectionId}" already exists.`;
      } else if (errorMessage.includes('Failed to retrieve access token')) {
        displayError = 'Error: Authentication failed. Please run `gcloud auth login`.';
      } else {
        displayError = `An unexpected error occurred: ${errorMessage}`;
      }

      return {
        llmContent: `Error creating connection: ${errorMessage}`,
        returnDisplay: displayError,
      };
    }
  }
}