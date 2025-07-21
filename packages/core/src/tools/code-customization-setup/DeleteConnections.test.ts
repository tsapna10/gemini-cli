/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Gaxios, GaxiosResponse } from 'gaxios';
import { Config } from '../../config/config.js';
import { DeleteConnectionTool } from './DeleteConnections.js';

// Mock the Gaxios class and uuid
vi.mock('gaxios', () => {
  const Gaxios = vi.fn();
  Gaxios.prototype.request = vi.fn();
  return { Gaxios };
});
vi.mock('uuid', () => ({
    v4: () => 'mock-uuid-v4',
}));


describe('DeleteConnectionTool', () => {
  let tool: DeleteConnectionTool;
  let mockConfig: Config;
  let mockGaxiosInstance: Gaxios;

  const validParams = {
    projectId: 'test-project',
    location: 'us-central1',
    connectionId: 'connection-to-delete',
  };

  const mockOperation = {
    name: 'operations/delete-conn-456',
    done: false,
  };


  beforeEach(() => {
    mockConfig = {} as Config;
    tool = new DeleteConnectionTool(mockConfig);
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
    test('should initiate connection deletion successfully', async () => {
      const mockApiResponse: Partial<GaxiosResponse> = { data: mockOperation, status: 200 };
      const requestSpy = vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue(mockApiResponse as GaxiosResponse);

      const result = await tool.execute(validParams);

      expect(result.returnDisplay).toBe(`Successfully initiated deletion of connection "${validParams.connectionId}". Operation: ${mockOperation.name}`);
      expect(result.operation?.name).toBe(mockOperation.name);

      const requestOptions = requestSpy.mock.calls[0][0];
      expect(requestOptions?.method).toBe('DELETE');
      expect(requestOptions?.url).toContain(`/connections/${validParams.connectionId}`);
    });

    test('should include all optional parameters in the request URL', async () => {
        const paramsWithExtras = {
            ...validParams,
            validateOnly: true,
            etag: '"abc-123"',
            requestId: '123e4567-e89b-12d3-a456-426614174000',
        };
        const requestSpy = vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue({ data: mockOperation } as GaxiosResponse);

        await tool.execute(paramsWithExtras);

        const requestUrl = new URL(requestSpy.mock.calls[0][0]?.url as string);
        expect(requestUrl.searchParams.get('validateOnly')).toBe('true');
        expect(requestUrl.searchParams.get('etag')).toBe('"abc-123"');
        expect(requestUrl.searchParams.get('requestId')).toBe(paramsWithExtras.requestId);
    });
  });

  describe('Parameter Validation', () => {
    test.each([
        ['projectId', { ...validParams, projectId: '' }, "The 'projectId' parameter is required."],
        ['location', { ...validParams, location: ' ' }, "The 'location' parameter is required."],
        ['connectionId', { ...validParams, connectionId: undefined }, "The 'connectionId' parameter is required."],
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
        expect(result.returnDisplay).toBe(`Error: Connection "${validParams.connectionId}" not found.`);
    });

    test('should handle 403 Permission Denied error', async () => {
        const error = new Error('Request failed with 403') as any;
        error.response = { status: 403 };
        vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

        const result = await tool.execute(validParams);
        expect(result.returnDisplay).toBe('Error: Permission denied. Ensure the caller has the "roles/developerconnect.connectionAdmin" role.');
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