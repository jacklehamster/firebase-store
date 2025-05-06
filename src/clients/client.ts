export interface KeyValueStore {
  setKeyValue(key: string, value: any): Promise<any>;
  getValue(key: string): Promise<any>;
  list(): Promise<Record<string, any>>;
  deleteKey(key: string): void;
  cleanup(): void;
  checkBeaconFailures(): void;
}

export function firebaseWrappedServer(url: string): KeyValueStore {
  return {
    async setKeyValue(key: string, value: any): Promise<any> {
      if (typeof (value) === 'function') {
        const previous = await this.getValue(key);
        value = value(previous);
      }
      const setUrl = `${url}/${key}?value=${encodeURIComponent(JSON.stringify(value))}`;
      await fetch(setUrl, { method: 'GET' });
      return value;
    },
    async getValue(key: string): Promise<any> {
      const response = await fetch(`${url}/${key}`);
      const data = await response.json();
      return data?.value ? JSON.parse(data.value) : undefined;
    },
    async list(): Promise<string[]> {
      const response = await fetch(url);
      const json = await response.json();
      return json.list;
    },
    deleteKey(key: string) {
      const deleteUrl = `${url}/${key}?delete=1`;
      const success = navigator.sendBeacon(deleteUrl);
      if (!success) {
        localStorage.setItem("beaconFailure", `Beacon failed for key: ${key} at ${new Date().toISOString()}`);
        console.warn("Beacon failed, falling back to fetch");
        fetch(deleteUrl);
      }
    },
    async cleanup(): Promise<{ keys: string[]; deletedKeys: string[] }> {
      const response = await fetch(`${url}?cleanup=1`);
      const json = await response.json();
      return json;
    },
    checkBeaconFailures() {
      const failure = localStorage.getItem("beaconFailure");
      if (failure) {
        console.warn(failure);
        localStorage.removeItem("beaconFailure");
      }
    },
  }
}
