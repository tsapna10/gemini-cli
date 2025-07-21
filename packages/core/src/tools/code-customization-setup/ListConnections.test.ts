/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Gaxios, GaxiosResponse } from 'gaxios';
import { Config } from '../../config/config.js';
import { ListConnectionsTool } from './ListConnections.js';

// Mock the Gaxios class
vi.mock('gaxios', () => {
  const Gaxios = vi.fn();
  Gaxios.prototype.request = vi.fn();
  return { Gaxios };
});

describe('ListConnectionsTool', () => {
  let tool: ListConnectionsTool;
  let mockConfig: Config;
  let mockGaxiosInstance: Gaxios;

  const validParams = {
    location: 'us-central1',
    projectId: 'test-project',
  };

  const mockConnections = [
      { name: 'conn-1', createTime: '2025-01-01T12:00:00Z', disabled: false, githubConfig: {} },
      { name: 'conn-2', createTime: '2025-01-02T12:00:00Z', disabled: true, gitlabConfig: {} },
  ];

  beforeEach(() => {
    mockConfig = {} as Config;
    tool = new ListConnectionsTool(mockConfig);
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
    test('should list connections successfully', async () => {
      const mockApiResponse: Partial<GaxiosResponse> = { data: { connections: mockConnections }, status: 200 };
      const requestSpy = vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue(mockApiResponse as GaxiosResponse);

      const result = await tool.execute(validParams);

      expect(result.returnDisplay).toBe('Successfully listed 2 connection(s).');
      expect(result.connections).toHaveLength(2);
      expect(result.llmContent).toContain('Connection 1:\n  Name: conn-1');
      expect(result.llmContent).toContain('Provider: github');
      expect(result.llmContent).toContain('Disabled: true');
      
      const requestUrl = requestSpy.mock.calls[0][0]?.url as string;
      expect(requestUrl).toContain('https://developerconnect.googleapis.com');
    });

    test('should handle pagination correctly', async () => {
        const mockResponse1 = { data: { connections: [mockConnections[0]], nextPageToken: 'page2' }, status: 200 };
        const mockResponse2 = { data: { connections: [mockConnections[1]] }, status: 200 };
        const requestSpy = vi.spyOn(mockGaxiosInstance, 'request')
            .mockResolvedValueOnce(mockResponse1 as GaxiosResponse)
            .mockResolvedValueOnce(mockResponse2 as GaxiosResponse);

        const result = await tool.execute(validParams);
        expect(result.connections).toHaveLength(2);
        expect(requestSpy).toHaveBeenCalledTimes(2);
        expect(requestSpy.mock.calls[1][0]?.url).toContain('pageToken=page2');
    });

    test('should include filter and orderBy in the request', async () => {
        const paramsWithFilter = { ...validParams, filter: 'disabled=true', orderBy: 'createTime' };
        const requestSpy = vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue({ data: {} } as GaxiosResponse);

        await tool.execute(paramsWithFilter);

        const requestUrl = new URL(requestSpy.mock.calls[0][0]?.url as string);
        expect(requestUrl.searchParams.get('filter')).toBe('disabled=true');
        expect(requestUrl.searchParams.get('orderBy')).toBe('createTime');
    });
  });

  describe('Error and Validation Scenarios', () => {
    test.each([
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
      expect(result.returnDisplay).toBe(`Error: Resources not found for project "test-project" in location "us-central1".`);
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