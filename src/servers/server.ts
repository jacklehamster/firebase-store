import { FirebaseConfigRest } from "./FirebaseConfigRest";
import { FireStorage } from "../FireStorage";

export interface ResponseData {
  keys?: string[];
  key?: string;
  value?: any;
  deletedKeys?: string[];
}

let storage: FireStorage | null = null;
export async function handleServerResponse(urlString: string, firebaseConfig: FirebaseConfigRest): Promise<ResponseData> {
  const url = new URL(urlString);
  if (!storage) {
    console.log("INITIALIZING Firebase");
    storage = new FireStorage(firebaseConfig);
  }
  if (url.pathname === "/") {
    const keys = await storage.listKeys();
    return { keys };
  }

  const key = url.pathname.substring(1);
  const value = url.searchParams.get("value");
  const del = url.searchParams.get("delete");
  const cleanup = url.searchParams.get("cleanup");

  if (cleanup) {
    const deletedKeys = await storage.cleanup();
    const keys = await storage.listKeys();
    return { keys, deletedKeys };
  } else if (del) {
    await storage.setKeyValue(key, undefined);
    const keys = await storage.listKeys();
    return { keys, deletedKeys: [key] };
  } else if (value !== null) {
    await storage.setKeyValue(key, { value });
    return { key, value };
  } else {
    const val = await storage.getValue(key);
    return { key, value: val?.value };
  }
}
