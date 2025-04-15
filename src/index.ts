/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import jwt from 'jsonwebtoken'; // Import the jsonwebtoken library

interface FirebaseConfigRest {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

class FireStorageRest {
  private projectId: string;
  private clientEmail: string;
  private privateKey: string;
  private rootPath: string;
  private accessToken: string | null = null;
  private accessTokenExpiry: number = 0;

  constructor(config: FirebaseConfigRest, rootPath: string = "myStore") {
    this.projectId = config.projectId;
    this.clientEmail = config.clientEmail;
    this.privateKey = config.privateKey.replace(/\\n/g, '\n'); // Handle escaped newlines
    this.rootPath = rootPath;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiry) {
      return this.accessToken;
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.clientEmail,
      scope: 'https://www.googleapis.com/auth/datastore', // Firestore scope
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600, // Token expiration time (1 hour)
      iat: now,
    };

    try {
      // Sign the JWT using the private key
      const signedJwt = jwt.sign(payload, this.privateKey, { algorithm: 'RS256' });

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${signedJwt}`,
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.access_token) {
        this.accessToken = tokenData.access_token;
        this.accessTokenExpiry = Date.now() + (tokenData.expires_in - 60) * 1000; // Refresh 60 seconds early
        return this.accessToken ?? "";
      } else {
        console.error("Error getting access token:", tokenData);
        throw new Error("Failed to obtain access token");
      }
    } catch (error) {
      console.error("Error generating or exchanging JWT:", error);
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
        firestoreData[key] = { arrayValue: { values: value.map((item) => this.convertToFirestoreData(item)) } };
      } else if (typeof value === 'object' && value !== null) {
        firestoreData[key] = { mapValue: { fields: this.convertToFirestoreData(value) } };
      } else if (value === null) {
        firestoreData[key] = { nullValue: null };
      }
      // Add more type handling as needed (timestamps, geo points, etc.)
    }
    return firestoreData;
  }

  private convertFromFirestoreData(firestoreData: any): any {
    const data: any = {};
    if (firestoreData && firestoreData.fields) {

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
        // Add more type handling as needed
      }
    }
    return data;
  }

  async setKeyValue(key: string, value: Record<string, any>) {
    try {
      const accessToken = await this.getAccessToken();
      const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/${this.rootPath}/${key}`;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: this.convertToFirestoreData(value) }),
      });

      const result = await response.text();
      const responseData = JSON.parse(result);

      if (!response.ok) {
        console.error("Error setting key-value (REST API):", response.status, responseData);
        throw new Error(`Failed to set value: ${response.status} - ${JSON.stringify(responseData)}`);
      }
    } catch (error) {
      console.error("Error setting key-value (REST API) - Catch:", error);
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
        console.error("Error getting value (REST API):", response.status, responseData);
        throw new Error(`Failed to get value: ${response.status} - ${JSON.stringify(responseData)}`);
      }

      // Return the converted fields directly
      const convertedData = this.convertFromFirestoreData(responseData);
      return convertedData || null;
    } catch (error) {
      console.error("Error getting value (REST API) - Catch:", error);
      return null;
    }
  }
}

export { FireStorageRest as FireStorage };
