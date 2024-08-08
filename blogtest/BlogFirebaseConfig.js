// Your Firebase configuration
// const firebaseConfig = {
//   apiKey: "YOUR_API_KEY",
//   authDomain: "YOUR_AUTH_DOMAIN",
//   projectId: "YOUR_PROJECT_ID",
//   storageBucket: "YOUR_STORAGE_BUCKET",
//   messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
//   appId: "YOUR_APP_ID"
// };


// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "-NB5g",
  authDomain: ".firebaseapp.com",
  databaseURL: "https://-default-rtdb.firebaseio.com",
  projectId: "",
  storageBucket: ".appspot.com",
  messagingSenderId: "",
  appId: "1:232907042392:web:",
  measurementId: "G-"
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore(); // Use Firestore for database operations
