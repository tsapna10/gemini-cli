/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Gaxios, GaxiosResponse } from 'gaxios';
import { Config } from '../config/config.js';
import { ListGitRepositoryLinksTool } from '../tools/ListRepoLinks.js'; 

// Mock the Gaxios class
vi.mock('gaxios', () => {
  const Gaxios = vi.fn();
  Gaxios.prototype.request = vi.fn();
  return { Gaxios };
});

describe('ListGitRepositoryLinksTool', () => {
  let tool: ListGitRepositoryLinksTool;
  let mockConfig: Config;
  let mockGaxiosInstance: Gaxios;

  const validParams = {
    connectionId: 'my-connection',
    location: 'us-central1',
    projectId: 'test-project',
  };

  const mockLinks = [
      { name: 'link-1', uri: 'http://example.com/repo1', reconciling: false },
      { name: 'link-2', uri: 'http://example.com/repo2', reconciling: true },
  ];

  beforeEach(() => {
    mockConfig = {} as Config;
    tool = new ListGitRepositoryLinksTool(mockConfig);
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
    test('should list git repository links successfully', async () => {
      const mockApiResponse: Partial<GaxiosResponse> = { data: { gitRepositoryLinks: mockLinks }, status: 200 };
      const requestSpy = vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue(mockApiResponse as GaxiosResponse);

      const result = await tool.execute(validParams);

      expect(result.returnDisplay).toBe('Successfully listed 2 Git Repository Link(s).');
      expect(result.gitRepositoryLinks).toHaveLength(2);
      expect(result.llmContent).toContain('Link 1:\n  Name: link-1');
      expect(result.llmContent).toContain('URI: http://example.com/repo2');
      expect(result.llmContent).toContain('Reconciling: true');
      
      const requestUrl = requestSpy.mock.calls[0][0]?.url as string;
      expect(requestUrl).toContain('https://developerconnect.googleapis.com');
    });

    test('should handle pagination correctly', async () => {
        const mockResponse1 = { data: { gitRepositoryLinks: [mockLinks[0]], nextPageToken: 'page2' }, status: 200 };
        const mockResponse2 = { data: { gitRepositoryLinks: [mockLinks[1]] }, status: 200 };
        const requestSpy = vi.spyOn(mockGaxiosInstance, 'request')
            .mockResolvedValueOnce(mockResponse1 as GaxiosResponse)
            .mockResolvedValueOnce(mockResponse2 as GaxiosResponse);

        const result = await tool.execute(validParams);
        expect(result.gitRepositoryLinks).toHaveLength(2);
        expect(requestSpy).toHaveBeenCalledTimes(2);
        expect(requestSpy.mock.calls[1][0]?.url).toContain('pageToken=page2');
    });
  });

  describe('Error and Validation Scenarios', () => {
    test.each([
      ['connectionId', { ...validParams, connectionId: '' }, "The 'connectionId' parameter is required."],
      ['location', { ...validParams, location: ' ' }, "The 'location' parameter is required."],
      ['projectId', { ...validParams, projectId: undefined }, "The 'projectId' parameter is required."],
    ])('should return validation error if %s is missing', async (_, params, expectedError) => {
        const result = await tool.execute(params as any);
        expect(result.returnDisplay).toBe(expectedError);
    });

    test('should handle 404 Not Found error', async () => {
      const error = new Error('Request failed with 404') as any;
      error.response = { status: 404 };
      vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

      const result = await tool.execute(validParams);
      expect(result.returnDisplay).toBe(`Error: Connection "${validParams.connectionId}" not found in location "${validParams.location}".`);
    });

    test('should handle authentication errors', async () => {
        vi.spyOn((tool as any).auth, 'getClient').mockResolvedValue({
            getAccessToken: vi.fn().mockResolvedValue({ token: null })
        });
        const result = await tool.execute(validParams);
        expect(result.returnDisplay).toBe('Error: Authentication failed. Please run `gcloud auth login`.');
    });
  });
});