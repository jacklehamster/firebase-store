import { FireStorage } from ".";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_KEY,
  authDomain: "webrtc-b85c9.firebaseapp.com",
  projectId: "webrtc-b85c9",
  storageBucket: "webrtc-b85c9.firebasestorage.app",
  messagingSenderId: "321301028335",
  appId: "1:321301028335:web:d7b65825507d893776ea1a",
  measurementId: "G-K15RTTZ6M5"
};

// Example usage:
async function runExample() {
  const fb = new FireStorage(firebaseConfig, "kvRoot");
  // Set some key-value pairs
  await fb.setKeyValue("name", "John Doe");
  await fb.setKeyValue("date", new Date().toString());
  await fb.setKeyValue("city", "San Francisco");

  // Retrieve the values
  const name = await fb.getValue("name");
  const date = await fb.getValue("date");
  const country = await fb.getValue("country"); // This key doesn't exist

  console.log("Retrieved Name:", name);
  console.log("Retrieved Date:", date);
  console.log("Retrieved Country:", country);
}

await runExample();
process.exit();
