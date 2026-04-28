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
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID
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
