import { createApiClient } from '@cuub/core';
import { tracker } from './analytics';
import { getApiBaseUrl } from './config';

export { ApiError, isAuthFailure } from '@cuub/core';

const client = createApiClient({
  baseUrl: getApiBaseUrl,
  observe: (info) => {
    if (!info.ok) tracker.apiError(info);
  },
});

export const apiGet = client.get;
export const apiPost = client.post;
export const apiPut = client.put;
export const apiPatch = client.patch;
export const apiDelete = client.delete;
