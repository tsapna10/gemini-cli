/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { Gaxios, GaxiosResponse } from 'gaxios';
import { Config } from '../../../src/config/config.js';
import { ListCRITool } from '../../../src/tools/code-customization-setup/ListCRI.js'; // Adjust path
import { ListRepositoryGroupsTool } from '../../../src/tools/code-customization-setup/ListGroups.js'; // Adjust path

// Mock the Gaxios class
vi.mock('gaxios', () => {
  const Gaxios = vi.fn();
  Gaxios.prototype.request = vi.fn();
  return { Gaxios };
});

// Mock the ListRepositoryGroupsTool
vi.mock('../../../src/tools/code-customization-setup/ListGroups.js', () => {
    const ListRepositoryGroupsTool = vi.fn();
    ListRepositoryGroupsTool.prototype.execute = vi.fn();
    return { ListRepositoryGroupsTool };
});


describe('ListCRITool', () => {
  let tool: ListCRITool;
  let mockConfig: Config;
  let mockGaxiosInstance: Gaxios;
  let mockListGroupsToolInstance: ListRepositoryGroupsTool;

  const validParams = { projectId: 'test-project', location: 'us-central1' };

  beforeEach(() => {
    mockConfig = {} as Config;
    tool = new ListCRITool(mockConfig);

    mockGaxiosInstance = new (Gaxios as any)();
    (tool as any).client = mockGaxiosInstance;

    // Get the mocked instance of the groups tool that is created inside ListCRITool
    mockListGroupsToolInstance = (tool as any).listRepositoryGroupsTool;

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
    
    // ... other successful tests are unchanged ...

    test('should handle pagination for groups by calling the group lister tool', async () => {
        const params = { projectId: 'test-project', location: 'us-central1' };
        const mockIndexesResponse: Partial<GaxiosResponse> = {
            data: { codeRepositoryIndexes: [{ name: 'projects/p/l/i/index1', state: 'ACTIVE' }] },
            status: 200,
        };
        // Mock the top-level call to get indexes
        const requestSpy = vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue(mockIndexesResponse as GaxiosResponse);

        
        vi.spyOn(mockListGroupsToolInstance, 'execute').mockResolvedValue({
            repositoryGroups: [{name: 'group1'}, {name: 'group2'}],
            llmContent: '',
            returnDisplay: 'Success',
        });

        const result = await tool.execute(params);

        expect(result.indexesWithGroups).toHaveLength(1);
        expect(result.indexesWithGroups?.[0].groups).toHaveLength(2);
        expect(result.llmContent).toContain('Groups (2):');
        
        // Assert that our two main components were called once each
        expect(requestSpy).toHaveBeenCalledTimes(1);
        expect(mockListGroupsToolInstance.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling Scenarios', () => {
    test('should handle API errors when listing indexes (e.g., 403 Forbidden)', async () => {
        const params = { projectId: 'test-project', location: 'us-central1' };
        const error = new Error('Permission Denied: PERMISSION_DENIED') as any;
        error.response = { status: 403 };
        vi.spyOn(mockGaxiosInstance, 'request').mockRejectedValue(error);

        const result = await tool.execute(params);
        
        
        expect(result.llmContent).toContain('Error listing resources');
        expect(result.returnDisplay).toBe(
          'Error: Permission denied. Ensure the caller has the necessary IAM roles (cloudaicompanion.codeRepositoryIndexes.list and cloudaicompanion.repositoryGroups.list) on the project.'
        );
    });

    test('should handle API errors when listing groups', async () => {
        const params = { projectId: 'test-project', location: 'us-central1' };
        const mockIndexesResponse: Partial<GaxiosResponse> = {
            data: { codeRepositoryIndexes: [{ name: 'projects/p/l/i/index1', state: 'ACTIVE' }, { name: 'projects/p/l/i/index2', state: 'ACTIVE' }] },
            status: 200
        };
        
        vi.spyOn(mockGaxiosInstance, 'request').mockResolvedValue(mockIndexesResponse as GaxiosResponse);

        
        vi.spyOn(mockListGroupsToolInstance, 'execute')
            .mockResolvedValueOnce({ // Fails for index1
                llmContent: 'Error...',
                returnDisplay: 'Error: Parent Index "index1" not found or API endpoint issue in staging.'
            })
            .mockResolvedValueOnce({ // Succeeds for index2
                repositoryGroups: [{ name: 'good-group' }],
                llmContent: 'Success',
                returnDisplay: 'Success'
            });

        const result = await tool.execute(params);
        expect(result.indexesWithGroups).toHaveLength(2);

        
        expect(result.indexesWithGroups?.[0].groupsError).toBe(
            'Error: Parent Index "index1" not found or API endpoint issue in staging.'
        );
        expect(result.llmContent).toContain('Groups Error:');
        
        // Check index2 for success
        expect(result.indexesWithGroups?.[1].groups).toHaveLength(1);
        expect(result.indexesWithGroups?.[1].groupsError).toBeUndefined();
    });

    test('should handle authentication errors', async () => {
        const params = { projectId: 'test-project', location: 'us-central1' };
        // This error happens before any gaxios calls, so we don't need to mock gaxios
        vi.spyOn((tool as any).auth, 'getClient').mockResolvedValue({
            getAccessToken: vi.fn().mockRejectedValue(new Error('Failed to retrieve access token.'))
        });
        
        const result = await tool.execute(params);
        
        
        expect(result.llmContent).toContain('Failed to retrieve access token.');
        expect(result.returnDisplay).toBe(
          'Error: Authentication failed. Please run `gcloud auth login` and `gcloud auth application-default login`.'
        );
    });
  });
});