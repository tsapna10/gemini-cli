/**
@license
Copyright 2025 Google LLC
SPDX-License-Identifier: Apache-2.0
*/

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Gaxios, GaxiosResponse } from 'gaxios';
import { Config } from '../config/config.js';
import { CreateGitRepositoryLinkTool } from '../tools/CreateRepoLinks.js'; 

// Mock the Gaxios class
vi.mock('gaxios', () => {
  const Gaxios = vi.fn();
  Gaxios.prototype.request = vi.fn();
  return { Gaxios };
});

describe('CreateGitRepositoryLinkTool', () => {
  let tool: CreateGitRepositoryLinkTool;
  let mockConfig: Config;
  let mockGaxiosInstance: Gaxios;

  const validParams = {
    projectId: 'test-project',
    location: 'us-central1',
    connectionId: 'my-connection',
    gitRepositoryLinkId: 'my-new-link',
    cloneUri: 'https://github.com/google/gemini-cli',
  };

  const mockOperation = {
    name: 'operations/create-link-12345',
    done: false,
  };

  beforeEach(() => {
    mockConfig = {} as Config;
    tool = new CreateGitRepositoryLinkTool(mockConfig);
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
    test('should initiate link creation successfully', async () => {
      const mockApiResponse: Partial<GaxiosResponse> = { data: mockOperation, status: 200 };
      const requestSpy = vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue(mockApiResponse as GaxiosResponse);

      const result = await tool.execute(validParams);

      expect(result.returnDisplay).toBe('Successfully initiated creation of Git Repository Link "my-new-link".');
      expect(result.operationName).toBe(mockOperation.name);
      expect(result.cloneUri).toBe(validParams.cloneUri);

      const requestOptions = requestSpy.mock.calls[0][0];
      expect(requestOptions?.method).toBe('POST');
      // Verifies that the tool adds `.git` to the URI
      expect(requestOptions?.data.cloneUri).toBe('https://github.com/google/gemini-cli.git');
    });

    test('should include optional labels and annotations in the request body', async () => {
      const paramsWithExtras = {
        ...validParams,
        labels: { team: 'gemini' },
        annotations: { 'review-by': 'dev-team' },
      };
      const requestSpy = vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue({ data: mockOperation } as GaxiosResponse);

      await tool.execute(paramsWithExtras);

      const requestBody = requestSpy.mock.calls[0][0]?.data;
      expect(requestBody.labels).toEqual({ team: 'gemini' });
      expect(requestBody.annotations).toEqual({ 'review-by': 'dev-team' });
    });

    test('should handle validateOnly parameter correctly', async () => {
        const paramsWithValidate = { ...validParams, validateOnly: true };
        const requestSpy = vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue({ data: mockOperation } as GaxiosResponse);

        await tool.execute(paramsWithValidate);

        const requestUrl = requestSpy.mock.calls[0][0]?.url as string;
        expect(requestUrl).toContain('validateOnly=true');
    });
  });

  describe('Parameter Validation', () => {
    test.each([
      ['projectId', { ...validParams, projectId: ' ' }, "The 'projectId' parameter is required."],
      ['location', { ...validParams, location: undefined }, "The 'location' parameter is required."],
      ['connectionId', { ...validParams, connectionId: '' }, "The 'connectionId' parameter is required."],
      ['gitRepositoryLinkId', { ...validParams, gitRepositoryLinkId: null }, "The 'gitRepositoryLinkId' parameter is required."],
      ['cloneUri', { ...validParams, cloneUri: ' ' }, "The 'cloneUri' parameter is required."],
    ])('should return a validation error if %s is invalid', async (_, params, expectedError) => {
        const result = await tool.execute(params as any);
        expect(result.returnDisplay).toBe(expectedError);
    });
  });

  describe('Error Handling Scenarios', () => {
    test('should handle 409 Conflict (Already Exists) error', async () => {
      const error = new Error('Request failed with 409') as any;
      error.response = { status: 409 };
      vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

      const result = await tool.execute(validParams);
      expect(result.returnDisplay).toBe(`Error: A Git Repository Link with ID "${validParams.gitRepositoryLinkId}" already exists.`);
    });

    test('should handle 404 Not Found for parent connection', async () => {
        const error = new Error('Request failed with 404') as any;
        error.response = { status: 404 };
        vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

        const result = await tool.execute(validParams);
        expect(result.returnDisplay).toBe(`Error: Connection "${validParams.connectionId}" not found in location "${validParams.location}".`);
    });

    test('should handle authentication errors', async () => {
      vi.spyOn((tool as any).auth, 'getClient').mockResolvedValue({
        getAccessToken: vi.fn().mockResolvedValue({ token: null }),
      });
      const result = await tool.execute(validParams);
      expect(result.returnDisplay).toBe('Error: Authentication failed. Please run `gcloud auth login`.');
    });
  });
});