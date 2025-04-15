import { FireStorage } from ".";

const firebaseConfig = {
  privateKey: process.env.FIREBASE_PRIVATE_KEY ?? "",
  projectId: process.env.FIREBASE_PROJECT_ID ?? "",
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? "",
};

// Example usage:
async function runExample() {
  const fb = new FireStorage(firebaseConfig, "kvRoot");
  // Set some key-value pairs
  await fb.setKeyValue("age", { age: 30 });
  await fb.setKeyValue("name", { name: "John Doe" });
  await fb.setKeyValue("date", { date: new Date().toString() });
  await fb.setKeyValue("city", { city: "San Francisco" });

  // Retrieve the values
  const age = await fb.getValue("age");
  const name = await fb.getValue("name");
  const date = await fb.getValue("date");
  const country = await fb.getValue("country"); // This key doesn't exist

  console.log("Retrieved age:", age);
  console.log("Retrieved Name:", name);
  console.log("Retrieved Date:", date);
  console.log("Retrieved Country:", country);
}

await runExample();
