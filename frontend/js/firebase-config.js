// Firebase Configuration
// Replace these values with your Firebase project configuration
// Get these from Firebase Console > Project Settings > General > Your apps

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBVWAGShjkDizr2yCIZ_FNshSbSi-rD280",
  authDomain: "projectsubmissionsystem-cde64.firebaseapp.com",
  projectId: "projectsubmissionsystem-cde64",
  storageBucket: "projectsubmissionsystem-cde64.firebasestorage.app",
  messagingSenderId: "60729468495",
  appId: "1:60729468495:web:52a3f8fcb0da40acfeec3a",
  measurementId: "G-F3GN38J726"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };

