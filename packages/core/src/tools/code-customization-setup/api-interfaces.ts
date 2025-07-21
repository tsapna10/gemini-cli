/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// --- SHARED INTERFACES ---

/**
 * Represents a long-running operation (LRO) returned by many Google Cloud APIs.
 */
export interface LongRunningOperation {
  name: string;
  metadata?: any;
  done: boolean;
  error?: {
    code: number;
    message: string;
    details?: any[];
  };
  response?: any;
}

/**
 * Represents a reference to a source code repository, typically used within a group.
 */
export interface RepositoryRef {
  resource: string;
  branchPattern?: string;
}


// --- CLOUD AI COMPANION API INTERFACES ---

/**
 * Represents a Code Repository Index resource.
 */
export interface CodeRepositoryIndex {
  name: string;
  createTime?: string;
  updateTime?: string;
  state?: string;
  labels?: Record<string, string>;
  kmsKey?: string;
  etag?: string;
}

/**
 * Represents a Repository Group within a Code Repository Index.
 */
export interface RepositoryGroup {
  name:string;
  createTime?: string;
  updateTime?: string;
  labels?: Record<string, string>;
  repositories?: RepositoryRef[];
}


// --- DEVELOPER CONNECT API INTERFACES ---

// Nested Config objects for Connections
export interface OAuthCredential {
    oauthTokenSecretVersion: string;
}

export interface UserCredential {
    userTokenSecretVersion: string;
}

export interface GitHubConfig {
    githubApp?: 'DEVELOPER_CONNECT' | 'FIREBASE';
    //authorizerCredential?: OAuthCredential;
    appInstallationId?: string;
}

export interface GitHubEnterpriseConfig {
    hostUri: string;
    appId: string;
    privateKeySecretVersion: string;
    webhookSecretSecretVersion: string;
    appInstallationId?: string;
}

export interface GitLabConfig {
    webhookSecretSecretVersion: string;
    readAuthorizerCredential: UserCredential;
    authorizerCredential: UserCredential;
}
// more configs can be added here


/**
 * Represents a Connection resource from Developer Connect.
 */
export interface Connection {
  name: string;
  createTime?: string;
  updateTime?: string;
  deleteTime?: string;
  labels?: Record<string, string>;
  disabled?: boolean;
  reconciling?: boolean;
  etag?: string;
  uid?: string;
  // Provider-specific configurations
  githubConfig?: GitHubConfig;
  githubEnterpriseConfig?: GitHubEnterpriseConfig;
  gitlabConfig?: GitLabConfig;
  [key: string]: any;
}

/**
 * Represents a Git Repository Link resource from Developer Connect.
 */
export interface GitRepositoryLink {
  name: string;
  cloneUri: string;
  createTime?: string;
  updateTime?: string;
  deleteTime?: string;
  labels?: Record<string, string>;
  etag?: string;
  reconciling?: boolean;
  annotations?: Record<string, string>;
  uid?: string;
}