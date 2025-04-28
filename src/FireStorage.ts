import { FirebaseConfigRest } from "./servers/FirebaseConfigRest";
import { hashString } from "./utils";

const CUTOFF_7_DAYS = 7 * 24 * 60 * 60 * 1000;

export class FireStorage {
  private projectId: string;
  private clientEmail: string;
  private privateKey: string;
  private rootPath: string;
  private accessToken: string | null = null;
  private accessTokenExpiry: number = 0;

  constructor(config: FirebaseConfigRest) {
    this.projectId = config.projectId;
    this.clientEmail = config.clientEmail;
    this.privateKey = config.privateKey.replace(/\\n/g, '\n');
    this.rootPath = config?.rootPath ?? "myStore";
  }

  // Utility to encode Base64 URL-safe
  private base64UrlEncode(data: string): string {
    return btoa(data)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // Utility to convert string to ArrayBuffer
  private strToArrayBuffer(str: string): ArrayBuffer {
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0; i < str.length; i++) {
      bufView[i] = str.charCodeAt(i);
    }
    return buf;
  }

  // Utility to import private key for Web Crypto
  private async importPrivateKey(pem: string): Promise<CryptoKey> {
    // Remove PEM headers and newlines
    const pemContents = pem
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s/g, '');
    const binaryDer = atob(pemContents);
    const der = this.strToArrayBuffer(binaryDer);

    return crypto.subtle.importKey(
      'pkcs8',
      der,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      },
      false,
      ['sign']
    );
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiry) {
      return this.accessToken;
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.clientEmail,
      scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    try {
      // Create JWT header
      const header = {
        alg: 'RS256',
        typ: 'JWT',
      };

      // Encode header and payload
      const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
      const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));

      // Create signing input
      const signingInput = `${encodedHeader}.${encodedPayload}`;

      // Import private key
      const privateKey = await this.importPrivateKey(this.privateKey);

      // Sign the JWT
      const signature = await crypto.subtle.sign(
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256',
        },
        privateKey,
        this.strToArrayBuffer(signingInput)
      );

      // Encode signature
      const encodedSignature = this.base64UrlEncode(
        String.fromCharCode(...new Uint8Array(signature))
      );

      // Create full JWT
      const signedJwt = `${signingInput}.${encodedSignature}`;

      // Exchange JWT for access token
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${signedJwt}`,
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.access_token) {
        this.accessToken = tokenData.access_token;
        this.accessTokenExpiry = Date.now() + (tokenData.expires_in - 60) * 1000;
        return this.accessToken ?? '';
      } else {
        console.error('Error getting access token:', tokenData);
        throw new Error('Failed to obtain access token');
      }
    } catch (error) {
      console.error('Error generating or exchanging JWT:', error);
      throw error;
    }
  }

  private convertToFirestoreData(data: Record<string, any>): Record<string, any> {
    const firestoreData: Record<string, any> = {};
    for (const key in data) {
      const value = data[key];
      if (typeof value === 'string') {
        firestoreData[key] = { stringValue: value };
      } else if (typeof value === 'number') {
        firestoreData[key] = Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
      } else if (typeof value === 'boolean') {
        firestoreData[key] = { booleanValue: value };
      } else if (Array.isArray(value)) {
        firestoreData[key] = { arrayValue: { values: value.map((item) => this.convertToFirestoreData({ value: item }).value) } };
      } else if (typeof value === 'object' && value !== null) {
        firestoreData[key] = { mapValue: { fields: this.convertToFirestoreData(value) } };
      } else if (value === null) {
        firestoreData[key] = { nullValue: null };
      }
    }
    return firestoreData;
  }

  private convertFromFirestoreData(firestoreData: any): any {
    if (!firestoreData) {
      return null;
    }

    if (!firestoreData.fields) {
      if (firestoreData.stringValue !== undefined) {
        return firestoreData.stringValue;
      } else if (firestoreData.integerValue !== undefined) {
        return parseInt(firestoreData.integerValue, 10);
      } else if (firestoreData.doubleValue !== undefined) {
        return parseFloat(firestoreData.doubleValue);
      } else if (firestoreData.booleanValue !== undefined) {
        return firestoreData.booleanValue;
      } else if (firestoreData.arrayValue !== undefined && firestoreData.arrayValue.values) {
        return firestoreData.arrayValue.values.map((item: any) => this.convertFromFirestoreData(item));
      } else if (firestoreData.mapValue !== undefined && firestoreData.mapValue.fields) {
        return this.convertFromFirestoreData(firestoreData.mapValue);
      } else if (firestoreData.nullValue !== undefined) {
        return null;
      }
      return firestoreData;
    }

    const data: any = {};
    for (const key in firestoreData.fields) {
      const value = firestoreData.fields[key];
      if (value.stringValue !== undefined) {
        data[key] = value.stringValue;
      } else if (value.integerValue !== undefined) {
        data[key] = parseInt(value.integerValue, 10);
      } else if (value.doubleValue !== undefined) {
        data[key] = parseFloat(value.doubleValue);
      } else if (value.booleanValue !== undefined) {
        data[key] = value.booleanValue;
      } else if (value.arrayValue !== undefined && value.arrayValue.values) {
        data[key] = value.arrayValue.values.map((item: any) => this.convertFromFirestoreData(item));
      } else if (value.mapValue !== undefined && value.mapValue.fields) {
        data[key] = this.convertFromFirestoreData(value.mapValue);
      } else if (value.nullValue !== undefined) {
        data[key] = null;
      }
    }
    return Object.keys(data).length > 0 ? data : null;
  }

  async setKeyValue(
    key: string,
    valueOrUpdater: undefined | Record<string, any> | ((prevValue: Record<string, any> | null) => Record<string, any>)
  ): Promise<void> {
    try {
      const accessToken = await this.getAccessToken();
      const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/${this.rootPath}/${key}`;

      let newValue: Record<string, any> | undefined;

      if (typeof valueOrUpdater === 'function') {
        // Fetch the current value
        const currentValue = await this.getValue(key);
        // Apply the updater function to get the new value
        newValue = valueOrUpdater(currentValue);
      } else {
        newValue = valueOrUpdater;
      }

      if (newValue) {
        newValue.timestamp = new Date().toISOString();
      }

      // If newValue is undefined, delete the document
      // Otherwise, update the document with newValue
      const response = await fetch(url, {
        method: newValue === undefined ? 'DELETE' : 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: newValue === undefined ? undefined : JSON.stringify({ fields: this.convertToFirestoreData(newValue) }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('Error setting key-value (REST API):', response.status, responseData);
        throw new Error(`Failed to set value: ${response.status} - ${JSON.stringify(responseData)}`);
      }
    } catch (error) {
      console.error('Error in setKeyValue (REST API) - Catch:', error);
      throw error;
    }
  }

  async getValue(key: string): Promise<Record<string, any> | null> {
    try {
      const accessToken = await this.getAccessToken();
      const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/${this.rootPath}/${key}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      const responseData = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`No document found for key "${key}" (REST API)`);
          return null;
        }
        console.error('Error getting value (REST API):', response.status, responseData);
        throw new Error(`Failed to get value: ${response.status} - ${JSON.stringify(responseData)}`);
      }

      const convertedData = this.convertFromFirestoreData(responseData);
      return convertedData || null;
    } catch (error) {
      console.error('Error getting value (REST API) - Catch:', error);
      return null;
    }
  }

  async list(): Promise<Record<string, Record<string, any>>> {
    try {
      const accessToken = await this.getAccessToken();
      const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/${this.rootPath}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('Error listing documents (REST API):', response.status, responseData);
        throw new Error(`Failed to list documents: ${response.status} - ${JSON.stringify(responseData)}`);
      }

      const result: Record<string, Record<string, any>> = {};

      for (const doc of responseData.documents || []) {
        const pathSegments = doc.name.split('/');
        const docId = pathSegments[pathSegments.length - 1];
        const data = this.convertFromFirestoreData(doc);
        if (data !== null) {
          result[docId] = data;
        }
      }

      return result;
    } catch (error) {
      console.error('Error listing documents (REST API) - Catch:', error);
      return {};
    }
  }

  async getDataHash(obj: any): Promise<string> {
    const json = JSON.stringify(obj);
    const hash = hashString(json);
    await this.setKeyValue(hash, obj);
    return hash;
  }

  async queryByTimestamp(field: string, operator: 'LESS_THAN' | 'LESS_THAN_OR_EQUAL' | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL' | 'EQUAL', value: string | number): Promise<{ id: string; data: Record<string, any> }[]> {
    const accessToken = await this.getAccessToken();
    const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents:runQuery`;
    const query = {
      structuredQuery: {
        from: [{ collectionId: this.rootPath }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: operator,
            value: typeof value === 'string' ? { stringValue: value } : { integerValue: String(value) },
          },
        },
      },
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    });
    const responseData = await response.json();
    if (!response.ok) throw new Error(`Query failed: ${response.status}`);
    return (responseData || [])
      .filter((result: any) => result.document)
      .map((result: any) => ({
        id: result.document.name.split('/').pop(),
        data: this.convertFromFirestoreData(result.document) || {},
      }));
  }

  async deleteByTimestamp(field: string, operator: 'LESS_THAN' | 'LESS_THAN_OR_EQUAL' | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL' | 'EQUAL', value: string | number): Promise<string[]> {
    const documents = await this.queryByTimestamp(field, operator, value);
    const deletedKeys: string[] = [];
    for (const doc of documents) {
      await this.setKeyValue(doc.id, undefined);
      deletedKeys.push(doc.id);
    }
    return deletedKeys;
  }

  async cleanup(): Promise<string[]> {
    try {
      // Calculate cutoff
      const cutoff = new Date(Date.now() - CUTOFF_7_DAYS).toISOString();

      // Delete documents with timestamp less than cutoff
      const deletedKeys = await this.deleteByTimestamp("timestamp", "LESS_THAN", cutoff);
      return deletedKeys; // Returns array of deleted document IDs
    } catch (error) {
      console.error('Error in cleanup:', error);
      throw error;
    }
  }
}
