/**
@license
Copyright 2025 Google LLC
SPDX-License-Identifier: Apache-2.0
*/

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Gaxios, GaxiosResponse } from 'gaxios';
import { Config } from '../../config/config.js';
import { GetGitRepositoryLinkTool } from './GetRepoLinks.js'; 

// Mock the Gaxios class
vi.mock('gaxios', () => {
  const Gaxios = vi.fn();
  Gaxios.prototype.request = vi.fn();
  return { Gaxios };
});

describe('GetGitRepositoryLinkTool', () => {
  let tool: GetGitRepositoryLinkTool;
  let mockConfig: Config;
  let mockGaxiosInstance: Gaxios;

  const validParams = {
    projectId: 'test-project',
    location: 'us-central1',
    connectionId: 'my-connection',
    gitRepositoryLinkId: 'my-link-id',
  };

  const mockGitRepositoryLink = {
    name: `projects/test-project/locations/us-central1/connections/my-connection/gitRepositoryLinks/my-link-id`,
    uid: 'unique-id-123',
    cloneUri: 'https://github.com/google/gemini-cli.git',
    createTime: '2025-01-01T12:00:00Z',
    updateTime: '2025-01-01T13:00:00Z',
    reconciling: false,
    etag: '"etag123"',
    labels: { env: 'prod' },
    annotations: { 'managed-by': 'gemini-cli' },
  };

  beforeEach(() => {
    mockConfig = {} as Config;
    tool = new GetGitRepositoryLinkTool(mockConfig);
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
    test('should get and format link details successfully', async () => {
      const mockApiResponse: Partial<GaxiosResponse> = { data: mockGitRepositoryLink, status: 200 };
      const requestSpy = vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue(mockApiResponse as GaxiosResponse);

      const result = await tool.execute(validParams);

      expect(result.returnDisplay).toBe('Successfully retrieved details for Git Repository Link "my-link-id".');
      expect(result.gitRepositoryLink?.name).toBe(mockGitRepositoryLink.name);
      expect(result.llmContent).toContain(`Name: ${mockGitRepositoryLink.name}`);
      expect(result.llmContent).toContain(`UID: ${mockGitRepositoryLink.uid}`);
      expect(result.llmContent).toContain(`Labels: \n    env: prod`);
      expect(result.llmContent).toContain(`Annotations: \n    managed-by: gemini-cli`);
      expect(requestSpy).toHaveBeenCalledOnce();
    });

    test('should correctly format output when optional fields are missing', async () => {
        const minimalLink = { ...mockGitRepositoryLink, labels: undefined, annotations: undefined };
        const mockApiResponse: Partial<GaxiosResponse> = { data: minimalLink, status: 200 };
        vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue(mockApiResponse as GaxiosResponse);

        const result = await tool.execute(validParams);
        expect(result.llmContent).toContain('Labels: N/A');
        expect(result.llmContent).toContain('Annotations: N/A');
    });
  });

  describe('Parameter Validation', () => {
    test.each([
      ['projectId', { ...validParams, projectId: '' }, "The 'projectId' parameter is required."],
      ['location', { ...validParams, location: ' ' }, "The 'location' parameter is required."],
      ['connectionId', { ...validParams, connectionId: undefined }, "The 'connectionId' parameter is required."],
      ['gitRepositoryLinkId', { ...validParams, gitRepositoryLinkId: null }, "The 'gitRepositoryLinkId' parameter is required."],
    ])('should return validation error for invalid param: %s', async (_, params, expectedError) => {
        const result = await tool.execute(params as any);
        expect(result.returnDisplay).toBe(expectedError);
    });
  });

  describe('Error Handling Scenarios', () => {
    test('should handle 404 Not Found error', async () => {
        const error = new Error('Request failed with 404') as any;
        error.response = { status: 404 };
        vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

        const result = await tool.execute(validParams);
        expect(result.returnDisplay).toBe(`Error: Git Repository Link "${validParams.gitRepositoryLinkId}" not found.`);
    });

    test('should handle 403 Permission Denied error', async () => {
        const error = new Error('Request failed with 403') as any;
        error.response = { status: 403 };
        vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

        const result = await tool.execute(validParams);
        expect(result.returnDisplay).toBe('Error: Permission denied. Ensure the caller has the "roles/developerconnect.viewer" role.');
    });

    test('should handle authentication failure', async () => {
        vi.spyOn((tool as any).auth, 'getClient').mockResolvedValue({
            getAccessToken: vi.fn().mockResolvedValue({ token: null })
        });
        const result = await tool.execute(validParams);
        expect(result.returnDisplay).toBe('Error: Authentication failed. Please run `gcloud auth login`.');
    });
  });
});