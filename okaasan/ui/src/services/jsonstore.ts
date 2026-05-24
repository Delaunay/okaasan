const USE_STATIC_MODE = import.meta.env.VITE_USE_STATIC_MODE === 'true';
const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export const isStaticMode = USE_STATIC_MODE;

class JsonStore {
  async list(collection: string): Promise<string[]> {
    if (isStaticMode) {
      const res = await fetch(`${API_BASE_URL}/store/${encodeURIComponent(collection)}.json`);
      if (!res.ok) return [];
      return res.json();
    }
    const res = await fetch(`${API_BASE_URL}/store/${encodeURIComponent(collection)}`);
    if (!res.ok) throw new Error(`list failed: ${res.status}`);
    return res.json();
  }

  async get<T = any>(collection: string, key: string): Promise<T> {
    if (isStaticMode) {
      const res = await fetch(
        `${API_BASE_URL}/store/${encodeURIComponent(collection)}/${encodeURIComponent(key)}.json`
      );
      if (!res.ok) throw new Error(`get failed: ${res.status}`);
      return res.json();
    }
    const res = await fetch(
      `${API_BASE_URL}/store/${encodeURIComponent(collection)}/${encodeURIComponent(key)}`
    );
    if (!res.ok) throw new Error(`get failed: ${res.status}`);
    return res.json();
  }

  async put<T = any>(collection: string, key: string, data: T): Promise<void> {
    if (isStaticMode) {
      throw new Error('Saving is not supported in static mode');
    }
    const res = await fetch(
      `${API_BASE_URL}/store/${encodeURIComponent(collection)}/${encodeURIComponent(key)}`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
    );
    if (!res.ok) throw new Error(`put failed: ${res.status}`);
  }

  async remove(collection: string, key: string): Promise<void> {
    if (isStaticMode) {
      throw new Error('Deleting is not supported in static mode');
    }
    const res = await fetch(
      `${API_BASE_URL}/store/${encodeURIComponent(collection)}/${encodeURIComponent(key)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw new Error(`delete failed: ${res.status}`);
  }
}

export const jsonStore = new JsonStore();

class PrivateJsonStore {
  async list(collection: string): Promise<string[]> {
    const res = await fetch(`${API_BASE_URL}/pstore/${encodeURIComponent(collection)}`);
    if (!res.ok) return [];
    return res.json();
  }

  async get<T = any>(collection: string, key: string): Promise<T> {
    const res = await fetch(
      `${API_BASE_URL}/pstore/${encodeURIComponent(collection)}/${encodeURIComponent(key)}`
    );
    if (!res.ok) throw new Error(`get failed: ${res.status}`);
    return res.json();
  }

  async put<T = any>(collection: string, key: string, data: T): Promise<void> {
    const res = await fetch(
      `${API_BASE_URL}/pstore/${encodeURIComponent(collection)}/${encodeURIComponent(key)}`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
    );
    if (!res.ok) throw new Error(`put failed: ${res.status}`);
  }

  async remove(collection: string, key: string): Promise<void> {
    const res = await fetch(
      `${API_BASE_URL}/pstore/${encodeURIComponent(collection)}/${encodeURIComponent(key)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw new Error(`delete failed: ${res.status}`);
  }
}

export const privateJsonStore = new PrivateJsonStore();
