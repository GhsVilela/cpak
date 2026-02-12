export interface AppConfig {
  API_BASE_URL: string;
}

let cachedConfig: AppConfig | null = null;

export async function getConfig(): Promise<AppConfig> {
  if (cachedConfig) return cachedConfig;

  // Check window.__CONFIG__ first (injected at runtime)
  if (typeof window !== 'undefined' && (window as any).__CONFIG__) {
    cachedConfig = (window as any).__CONFIG__;
    return cachedConfig as AppConfig;
  }

  // Fall back to config.json
  try {
    const response = await fetch('/config.json');
    cachedConfig = await response.json();
    return cachedConfig as AppConfig;
  } catch (error) {
    console.error('Failed to load config, using defaults', error);
    cachedConfig = {
      API_BASE_URL: 'http://localhost:8080/api',
    };
    return cachedConfig;
  }
}
