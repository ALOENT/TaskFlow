// ============================================
//  TaskFlow — Firebase Configuration
//  Migrated from CDN to npm imports for Vite bundling
// ============================================
import { initializeApp }               from 'firebase/app';
import { getAuth, GoogleAuthProvider,
         signInWithPopup, signOut,
         onAuthStateChanged,
         createUserWithEmailAndPassword,
         signInWithEmailAndPassword,
         updateProfile,
         updatePassword,
         reauthenticateWithCredential,
         reauthenticateWithPopup,
         EmailAuthProvider }           from 'firebase/auth';
import { getFirestore, collection, addDoc,
         deleteDoc, doc, updateDoc, query,
         orderBy, onSnapshot, getDocs,
         getDoc, setDoc,
         serverTimestamp, writeBatch,
         where }                       from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            "AIzaSyClYYhtsn04OdidKPREmL1BFlBQvdodm_Y",
  authDomain:        "taskflow-35cd4.firebaseapp.com",
  projectId:         "taskflow-35cd4",
  storageBucket:     "taskflow-35cd4.firebasestorage.app",
  messagingSenderId: "106262602008",
  appId:             "1:106262602008:web:9a17ac4f09a1d066f4fe6d"
};

const app = initializeApp(firebaseConfig);

const auth         = getAuth(app);
const db           = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export {
  auth, db, googleProvider,
  signInWithPopup, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile,
  updatePassword, reauthenticateWithCredential, reauthenticateWithPopup, EmailAuthProvider,
  collection, addDoc, deleteDoc, doc, updateDoc, query, orderBy, onSnapshot, getDocs,
  getDoc, setDoc,
  serverTimestamp, writeBatch, where
};
