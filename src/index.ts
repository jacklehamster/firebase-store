/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

// Import necessary Firebase functions
import { FirebaseApp, FirebaseOptions, initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, Firestore } from "firebase/firestore";
// import { getAnalytics } from "firebase/analytics";

class FireStorage {
  app: FirebaseApp;
  db: Firestore;
  constructor(config: FirebaseOptions, private rootPath: string = "myStore") {
    this.app = initializeApp(config);
    this.db = getFirestore(this.app);
  }

  async setKeyValue(key: string, value: any) {
    try {
      // Create a document reference using the key as the document ID
      const docRef = doc(this.db, this.rootPath, key);
      // Set the data in the document
      await setDoc(docRef, { value });
      console.log(`Successfully set key "${key}" with value:`, value);
    } catch (error) {
      console.error("Error setting key-value:", error);
    }
  }

  // Function to retrieve a value by key
  async getValue(key: string) {
    try {
      // Get a reference to the document
      const docRef = doc(this.db, this.rootPath, key);
      // Get the document snapshot
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log(`Value for key "${key}":`, data.value);
        return data.value;
      } else {
        console.log(`No document found for key "${key}"`);
        return null;
      }
    } catch (error) {
      console.error("Error getting value:", error);
      return null;
    }
  }

}

export { FireStorage };
