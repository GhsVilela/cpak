import { getConfig } from './config';

export class ApiClient {
  private baseUrl: string | null = null;

  private async getBaseUrl(): Promise<string> {
    if (!this.baseUrl) {
      const config = await getConfig();
      this.baseUrl = config.API_BASE_URL;
    }
    return this.baseUrl;
  }

  async get<T>(path: string): Promise<T> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}${path}`);
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
    return response.json();
  }

  async post<T>(path: string, body?: any): Promise<T> {
    const baseUrl = await this.getBaseUrl();
    const headers: Record<string, string> = {};
    let requestBody: string | undefined = undefined;

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: requestBody,
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
    return response.json();
  }

  async patch<T>(path: string, body: any): Promise<T> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
    return response.json();
  }

  async put<T>(path: string, body: any): Promise<T> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
    return response.json();
  }

  async delete(path: string): Promise<void> {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
  }

  // Settings API methods
  async getAllSettings(): Promise<{ settings: Array<{ key: string; value: string; category: string; isSecret: boolean }> }> {
    return this.get('/settings');
  }

  async getSetting(key: string): Promise<{ key: string; value: string; category: string; isSecret: boolean }> {
    return this.get(`/settings/${key}`);
  }

  async updateSetting(key: string, value: string, category: string): Promise<{ message: string }> {
    return this.put(`/settings/${key}`, { value, category });
  }

  async deleteSetting(key: string): Promise<void> {
    return this.delete(`/settings/${key}`);
  }
}

export const apiClient = new ApiClient();
