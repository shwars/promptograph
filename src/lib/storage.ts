const API_KEY_STORAGE_KEY = 'promptograph.apiKey';
const ACK_STORAGE_KEY = 'promptograph.apiKeyRiskAcknowledged';

export function loadStoredApiKey(): string {
  return window.localStorage.getItem(API_KEY_STORAGE_KEY) ?? '';
}

export function saveStoredApiKey(apiKey: string): void {
  if (apiKey) {
    window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    return;
  }

  window.localStorage.removeItem(API_KEY_STORAGE_KEY);
}

export function loadRiskAcknowledgement(): boolean {
  return window.localStorage.getItem(ACK_STORAGE_KEY) === 'true';
}

export function saveRiskAcknowledgement(value: boolean): void {
  if (value) {
    window.localStorage.setItem(ACK_STORAGE_KEY, 'true');
    return;
  }

  window.localStorage.removeItem(ACK_STORAGE_KEY);
}
