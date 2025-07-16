/**
@license
Copyright 2025 Google LLC
SPDX-License-Identifier: Apache-2.0 */
import { BaseTool, ToolResult } from './tools.js';
import { Config } from '../config/config.js';
import { getErrorMessage } from '../utils/errors.js';
import { GoogleAuth } from 'google-auth-library';
import { GaxiosResponse, Gaxios, GaxiosOptions } from 'gaxios';
import { Type } from '@google/genai';

// Interface for a single GitRepositoryLink resource for the request body
interface GitRepositoryLinkBody {
  cloneUri: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

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
  response?: {
    '@type': string;
    [key: string]: any;
  };
}

/**
 * Parameters for the CreateGitRepositoryLinkTool.
 */
export interface CreateGitRepositoryLinkParams {
  /** The Google Cloud project ID. */
  projectId: string;
  /** The Google Cloud location (region). */
  location: string;
  /** The ID of the parent Developer Connect connection. */
  connectionId: string;
  /** The ID to use for the new repository link. */
  gitRepositoryLinkId: string;
  /** The Git Clone URI for the repository. */
  cloneUri: string;
  /** Optional. Labels to apply to the new link. */
  labels?: Record<string, string>;
  /** Optional. Annotations to apply to the new link. */
  annotations?: Record<string, string>;
  /** Optional. API environment. Defaults to 'prod'. */
  environment?: 'prod' | 'staging';
  /** Optional. If set, validate the request, but do not actually create the link. */
  validateOnly?: boolean;
}

/**
 * Result from the CreateGitRepositoryLinkTool.
 */
export interface CreateGitRepositoryLinkResult extends ToolResult {
  /** The name of the long-running operation resource. */
  operationName?: string;
  /** The clone URI of the created link. */
  cloneUri?: string;
}

/**
 * A tool to create a new Git Repository Link in Developer Connect.
 */
export class CreateGitRepositoryLinkTool extends BaseTool<
  CreateGitRepositoryLinkParams,
  CreateGitRepositoryLinkResult
> {
  static readonly Name: string = 'create_git_repository_link';
  private auth: GoogleAuth;
  private client: Gaxios;

  constructor(private readonly config: Config) {
    super(
      CreateGitRepositoryLinkTool.Name,
      'Create Developer Connect Git Repository Link',
      'Creates a new Git Repository Link within a specific Developer Connect connection.',
      {
        type: Type.OBJECT,
        properties: {
          projectId: { type: Type.STRING, description: 'The Google Cloud project ID.' },
          location: { type: Type.STRING, description: 'The Google Cloud location.' },
          connectionId: { type: Type.STRING, description: 'ID of the parent connection.' },
          gitRepositoryLinkId: { type: Type.STRING, description: 'The unique ID for the new repository link.' },
          cloneUri: { type: Type.STRING, description: 'The Git Clone URI.' },
          labels: { type: Type.OBJECT, description: 'Optional. Labels for the link.' },
          annotations: { type: Type.OBJECT, description: 'Optional. Annotations for the link.' },
          environment: { type: Type.STRING, enum: ['prod', 'staging'], default: 'prod' },
          validateOnly: { type: Type.BOOLEAN, description: 'Optional. If true, only validates the request.' },
        },
        required: ['projectId', 'location', 'connectionId', 'gitRepositoryLinkId', 'cloneUri'],
      },
    );
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    this.client = new Gaxios();
  }

  validateParams(params: CreateGitRepositoryLinkParams): string | null {
    if (!params.projectId?.trim()) return "The 'projectId' parameter is required.";
    if (!params.location?.trim()) return "The 'location' parameter is required.";
    if (!params.connectionId?.trim()) return "The 'connectionId' parameter is required.";
    if (!params.gitRepositoryLinkId?.trim()) return "The 'gitRepositoryLinkId' parameter is required.";
    if (!params.cloneUri?.trim()) return "The 'cloneUri' parameter is required.";
    return null;
  }

  // Note: Developer Connect has a different endpoint from Cloud AI Companion.
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

  async execute(params: CreateGitRepositoryLinkParams): Promise<CreateGitRepositoryLinkResult> {
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
      const parentName = `projects/${projectId}/locations/${params.location}/connections/${params.connectionId}`;
      const baseApiUrl = `${endpoint}/v1/${parentName}/gitRepositoryLinks`;

      const urlParams = new URLSearchParams({
        gitRepositoryLinkId: params.gitRepositoryLinkId,
        alt: 'json',
      });
      if (params.validateOnly) urlParams.append('validateOnly', 'true');
      // A UUID can be generated for requestId if needed, but it's optional per docs
      // urlParams.append('requestId', crypto.randomUUID());

      const apiUrl = `${baseApiUrl}?${urlParams.toString()}`;

       let processedCloneUri = params.cloneUri;
      if (!processedCloneUri.endsWith('.git')) {
        processedCloneUri += '.git';
      }

      const requestBody: GitRepositoryLinkBody = { cloneUri: processedCloneUri };
      if (params.labels) requestBody.labels = params.labels;
      if (params.annotations) requestBody.annotations = params.annotations;

      const response = await this.makeRequest<Operation>({
        url: apiUrl,
        method: 'POST',
        headers,
        data: requestBody,
      });

      const operation = response.data;
      const formattedOutput = `Operation Name: ${operation.name}`;

      return {
        llmContent: `Git Repository Link creation started. Operation details: ${formattedOutput}`,
        returnDisplay: `Successfully initiated creation of Git Repository Link "${params.gitRepositoryLinkId}".`,
        operationName: operation.name,
        cloneUri: params.cloneUri,
      };

    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      let displayError = 'Error creating Git Repository Link.';

      if (errorMessage.includes('403')) {
        displayError = 'Error: Permission denied. Ensure the caller has the "roles/developerconnect.editor" role.';
      } else if (errorMessage.includes('404')) {
        displayError = `Error: Connection "${params.connectionId}" not found in location "${params.location}".`;
      } else if (errorMessage.includes('409')) {
        displayError = `Error: A Git Repository Link with ID "${params.gitRepositoryLinkId}" already exists.`;
      } else if (errorMessage.includes('Failed to retrieve access token')) {
        displayError = 'Error: Authentication failed. Please run `gcloud auth login`.';
      } else {
        displayError = `An unexpected error occurred: ${errorMessage}`;
      }

      return {
        llmContent: `Error creating Git Repository Link: ${errorMessage}`,
        returnDisplay: displayError,
      };
    }
  }
}