import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyABBeG4HogtJHLqKokDx6Qt978jgwvjdJY",
  authDomain: "beatdown-397a5.firebaseapp.com",
  databaseURL: "https://beatdown-397a5-default-rtdb.firebaseio.com",
  projectId: "beatdown-397a5",
  storageBucket: "beatdown-397a5.firebasestorage.app",
  messagingSenderId: "990560312117",
  appId: "1:990560312117:web:0da80dffbe0ffe8b100a7c",
  measurementId: "G-P3MN1DQ8JE",
};

const app = initializeApp(firebaseConfig);
export const realtimeDb = getDatabase(app);
