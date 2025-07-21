/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Gaxios, GaxiosResponse } from 'gaxios';
import { Config } from '../../config/config.js';
import { CreateConnectionTool } from './CreateConnections.js';

// Mock the Gaxios class and uuid
vi.mock('gaxios', () => {
  const Gaxios = vi.fn();
  Gaxios.prototype.request = vi.fn();
  return { Gaxios };
});
vi.mock('uuid', () => ({
    v4: () => 'mock-uuid-v4',
}));


describe('CreateConnectionTool', () => {
  let tool: CreateConnectionTool;
  let mockConfig: Config;
  let mockGaxiosInstance: Gaxios;

  const validBaseParams = {
    projectId: 'test-project',
    location: 'us-central1',
    connectionId: 'my-new-connection',
  };

  const mockOperation = {
    name: 'operations/create-conn-123',
    done: false,
  };

  beforeEach(() => {
    mockConfig = {} as Config;
    tool = new CreateConnectionTool(mockConfig);
    mockGaxiosInstance = new (Gaxios as any)();
    (tool as any).client = mockGaxiosInstance;

    const mockAuth = {
      getClient: vi.fn().mockResolvedValue({
        getAccessToken: vi.fn().mockResolvedValue({ token: 'fake-access-token' }),
      }),
    };
    (tool as any).auth = mockAuth;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful Execution Scenarios', () => {
    test('should create a basic GitHub connection and prompt user to complete auth in UI', async () => {
      const params = {
          ...validBaseParams,
          githubConfig: { githubApp: 'DEVELOPER_CONNECT' as const }
      };
      const mockApiResponse: Partial<GaxiosResponse> = { data: mockOperation, status: 200 };
      const requestSpy = vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue(mockApiResponse as GaxiosResponse);

      const result = await tool.execute(params);

      // Verify the user-friendly message for the two-step GitHub auth process
      expect(result.returnDisplay).toBe(`Successfully initiated creation for connection "${params.connectionId}". Operation: ${mockOperation.name} Finish the authentication in the cloud console ui`);
      expect(result.operation?.name).toBe(mockOperation.name);

      const requestOptions = requestSpy.mock.calls[0][0];
      expect(requestOptions?.method).toBe('POST');
      expect(requestOptions?.data.githubConfig).toEqual(params.githubConfig);
    });

    test('should create a GitLab connection with full auth details', async () => {
        const params = {
            ...validBaseParams,
            gitlabConfig: { 
                webhookSecretSecretVersion: 'projects/p/secrets/s/versions/1', 
                readAuthorizerCredential: { userTokenSecretVersion: 'projects/p/secrets/s/versions/2'}, 
                authorizerCredential: { userTokenSecretVersion: 'projects/p/secrets/s/versions/3'}
            },
        };
        const requestSpy = vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue({ data: mockOperation } as GaxiosResponse);

        await tool.execute(params);

        const requestBody = requestSpy.mock.calls[0][0]?.data;
        expect(requestBody.gitlabConfig).toEqual(params.gitlabConfig);
    });
  });

  describe('Parameter Validation', () => {
    test.each([
      ['projectId', { ...validBaseParams, projectId: ' ', githubConfig: { githubApp: 'FIREBASE' } }, "The 'projectId' parameter is required."],
      ['connectionId', { ...validBaseParams, connectionId: undefined, githubConfig: { githubApp: 'FIREBASE' } }, "The 'connectionId' parameter is required."],
      ['no provider config', { ...validBaseParams }, 'One provider configuration (e.g., githubConfig, gitlabConfig) must be specified.'],
      ['multiple provider configs', { ...validBaseParams, githubConfig: { githubApp: 'FIREBASE' }, gitlabConfig: {} }, 'Only one provider configuration can be specified at a time.'],
    ])('should return validation error for invalid params: %s', async (_, params, expectedError) => {
        const result = await tool.execute(params as any);
        expect(result.returnDisplay).toBe(expectedError);
    });
  });


  describe('Error Handling Scenarios', () => {
    test('should handle 409 Conflict (Already Exists) error', async () => {
        const params = { ...validBaseParams, githubConfig: { githubApp: 'DEVELOPER_CONNECT' as const } };
        const error = new Error('Request failed: ALREADY_EXISTS') as any;
        error.response = { status: 409 };
        vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

        const result = await tool.execute(params);
        expect(result.returnDisplay).toBe(`Error: A connection with ID "${validBaseParams.connectionId}" already exists.`);
    });

    test('should handle 403 Permission Denied error', async () => {
        const params = { ...validBaseParams, githubConfig: { githubApp: 'DEVELOPER_CONNECT' as const } };
        const error = new Error('Request failed: PERMISSION_DENIED') as any;
        error.response = { status: 403 };
        vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

        const result = await tool.execute(params);
        expect(result.returnDisplay).toBe('Error: Permission denied. Ensure the caller has the "roles/developerconnect.connectionAdmin" role.');
    });
  });
});