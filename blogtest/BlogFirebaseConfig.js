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
  apiKey: "AIzaSyBxkgUCQNflHvknU6CXe9Yphh9hBm-NB5g",
  authDomain: "linksstorebyshubham.firebaseapp.com",
  databaseURL: "https://linksstorebyshubham-default-rtdb.firebaseio.com",
  projectId: "linksstorebyshubham",
  storageBucket: "linksstorebyshubham.appspot.com",
  messagingSenderId: "232907042392",
  appId: "1:232907042392:web:c3c0eb927116e41d77642d",
  measurementId: "G-D151S3RKV0"
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore(); // Use Firestore for database operations
