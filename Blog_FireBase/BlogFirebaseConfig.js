
// Firebase configuration using environment variables
const firebaseConfig = {
  apiKey: process.env.APIKEY,  // Use environment variable for API key
  authDomain: process.env.AUTHDOMAIN,  // Use environment variable for Auth Domain
  databaseURL: process.env.DATABASEURL,  // Use environment variable for Database URL
  projectId: process.env.PROJECTID,  // Use environment variable for Project ID
  storageBucket: process.env.STORAGEBUCKET,  // Use environment variable for Storage Bucket
  messagingSenderId: process.env.MESSAGINGSENDERID,  // Use environment variable for Messaging Sender ID
  appId: process.env.APPID,  // Use environment variable for App ID
  measurementId: process.env.MEASUREMENTID,  // Use environment variable for Measurement ID
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Set database variable
const database = firebase.database();
