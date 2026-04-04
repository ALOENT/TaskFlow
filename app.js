// ============================================
//  TaskFlow — App Logic (Firebase Auth + Firestore)
//  All tasks stored at: users/{uid}/tasks/{taskId}
// ============================================

import {
  auth, db, googleProvider,
  // Auth
  signInWithPopup, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile,
  // Firestore
  collection, addDoc, deleteDoc, doc, updateDoc,
  query, orderBy, onSnapshot, serverTimestamp
} from './firebase-config.js';

// ============================================
//  DOM REFERENCES
// ============================================
const loadingOverlay      = document.getElementById('loading-overlay');
const authScreen          = document.getElementById('auth-screen');
const appContainer        = document.getElementById('app-container');

// Auth elements
const tabSignin           = document.getElementById('tab-signin');
const tabSignup           = document.getElementById('tab-signup');
const googleBtn           = document.getElementById('google-btn');
const authForm            = document.getElementById('auth-form');
const nameGroup           = document.getElementById('name-group');
const confirmGroup        = document.getElementById('confirm-group');
const authName            = document.getElementById('auth-name');
const authEmail           = document.getElementById('auth-email');
const authPassword        = document.getElementById('auth-password');
const authConfirm         = document.getElementById('auth-confirm');
const authError           = document.getElementById('auth-error');
const authSubmit          = document.getElementById('auth-submit');
const authSubmitText      = document.getElementById('auth-submit-text');
const btnSpinner          = document.getElementById('btn-spinner');
const togglePassword      = document.getElementById('toggle-password');
const eyeIcon             = document.getElementById('eye-icon');

// User info in header
const userAvatar          = document.getElementById('user-avatar');
const userName            = document.getElementById('user-name');
const userEmail           = document.getElementById('user-email');
const signoutBtn          = document.getElementById('signout-btn');

// Task app elements
const taskInput           = document.getElementById('task-input');
const addTaskBtn          = document.getElementById('add-task-btn');
const activeTaskList      = document.getElementById('active-task-list');
const completedTaskList   = document.getElementById('completed-task-list');
const totalCountEl        = document.getElementById('total-count');
const activeCountEl       = document.getElementById('active-count');
const completedPercentEl  = document.getElementById('completed-percentage');
const activeSectionCount  = document.getElementById('active-section-count');
const completedSectionCount = document.getElementById('completed-section-count');
const activeEmptyEl       = document.getElementById('active-empty');
const completedEmptyEl    = document.getElementById('completed-empty');

// ============================================
//  STATE
// ============================================
let currentUser     = null;
let tasks           = [];
let unsubscribeTasks = null;   // Firestore listener unsubscribe fn
let isSignupMode    = false;

// ============================================
//  UI HELPERS
// ============================================
function showLoading()  { loadingOverlay.classList.remove('hidden'); }
function hideLoading()  { loadingOverlay.classList.add('hidden'); }

function showApp() {
  authScreen.style.display  = 'none';
  appContainer.style.display = '';
}

function showAuth() {
  authScreen.style.display   = '';
  appContainer.style.display = 'none';
}

function setAuthLoading(loading) {
  authSubmit.disabled          = loading;
  googleBtn.disabled           = loading;
  btnSpinner.style.display     = loading ? '' : 'none';
  authSubmitText.style.display = loading ? 'none' : '';
}

function showAuthError(message) {
  authError.textContent    = message;
  authError.style.display  = '';
}

function clearAuthError() {
  authError.style.display = 'none';
  authError.textContent   = '';
}

// ============================================
//  AUTH MODE SWITCHING (Sign In / Sign Up)
// ============================================
function setMode(signup) {
  isSignupMode = signup;
  clearAuthError();

  tabSignin.classList.toggle('active', !signup);
  tabSignup.classList.toggle('active',  signup);
  tabSignin.setAttribute('aria-selected', String(!signup));
  tabSignup.setAttribute('aria-selected', String(signup));

  nameGroup.style.display    = signup ? '' : 'none';
  confirmGroup.style.display = signup ? '' : 'none';
  authSubmitText.textContent = signup ? 'Create Account' : 'Sign In';
  authPassword.autocomplete  = signup ? 'new-password' : 'current-password';
}

tabSignin.addEventListener('click', () => setMode(false));
tabSignup.addEventListener('click', () => setMode(true));

// Password visibility toggle
togglePassword.addEventListener('click', () => {
  const isText = authPassword.type === 'text';
  authPassword.type = isText ? 'password' : 'text';
  eyeIcon.innerHTML = isText
    ? `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`
    : `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
});

// ============================================
//  FIREBASE AUTH — ERROR MESSAGES
// ============================================
function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found':       'No account found with this email.',
    'auth/wrong-password':       'Incorrect password. Please try again.',
    'auth/invalid-credential':   'Invalid email or password.',
    'auth/email-already-in-use': 'This email is already registered. Try signing in.',
    'auth/weak-password':        'Password must be at least 6 characters.',
    'auth/invalid-email':        'Please enter a valid email address.',
    'auth/too-many-requests':    'Too many attempts. Please wait a moment and try again.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed. Please try again.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// ============================================
//  GOOGLE SIGN-IN
// ============================================
googleBtn.addEventListener('click', async () => {
  clearAuthError();
  setAuthLoading(true);
  try {
    await signInWithPopup(auth, googleProvider);
    // onAuthStateChanged will handle the rest
  } catch (err) {
    showAuthError(friendlyAuthError(err.code));
    setAuthLoading(false);
  }
});

// ============================================
//  EMAIL / PASSWORD AUTH
// ============================================
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAuthError();

  const email    = authEmail.value.trim();
  const password = authPassword.value;
  const name     = authName.value.trim();
  const confirm  = authConfirm.value;

  // Validation
  if (!email || !password) { showAuthError('Please fill in all fields.'); return; }
  if (isSignupMode && !name)              { showAuthError('Please enter your name.'); return; }
  if (isSignupMode && password !== confirm) { showAuthError('Passwords do not match.'); return; }
  if (isSignupMode && password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }

  setAuthLoading(true);
  try {
    if (isSignupMode) {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      // onAuthStateChanged handles the redirect
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    showAuthError(friendlyAuthError(err.code));
    setAuthLoading(false);
  }
});

// ============================================
//  SIGN OUT
// ============================================
signoutBtn.addEventListener('click', async () => {
  if (unsubscribeTasks) { unsubscribeTasks(); unsubscribeTasks = null; }
  tasks = [];
  await signOut(auth);
});

// ============================================
//  AUTH STATE OBSERVER
// ============================================
onAuthStateChanged(auth, (user) => {
  hideLoading();

  if (user) {
    currentUser = user;
    setAuthLoading(false);
    updateHeaderUI(user);
    showApp();
    subscribeToTasks(user.uid);
  } else {
    // Clean up
    if (unsubscribeTasks) { unsubscribeTasks(); unsubscribeTasks = null; }
    currentUser = null;
    tasks = [];
    showAuth();
    resetAuthForm();
  }
});

function resetAuthForm() {
  authForm.reset();
  clearAuthError();
  setMode(false);
  setAuthLoading(false);
}

// ============================================
//  UPDATE HEADER USER INFO
// ============================================
function updateHeaderUI(user) {
  const displayName = user.displayName || user.email.split('@')[0];
  const email       = user.email;

  userName.textContent  = displayName;
  userEmail.textContent = email;

  if (user.photoURL) {
    userAvatar.innerHTML = `<img src="${user.photoURL}" alt="${displayName}" referrerpolicy="no-referrer">`;
  } else {
    // Initials from display name
    const initials = displayName
      .split(' ')
      .map(w => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    userAvatar.textContent = initials;
  }
}

// ============================================
//  FIRESTORE — REAL-TIME TASK LISTENER
// ============================================
function subscribeToTasks(uid) {
  // Unsubscribe any previous listener
  if (unsubscribeTasks) unsubscribeTasks();

  const tasksRef = collection(db, 'users', uid, 'tasks');
  const q        = query(tasksRef, orderBy('createdAt', 'desc'));

  unsubscribeTasks = onSnapshot(q, (snapshot) => {
    tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTasks();
  }, (err) => {
    console.error('Firestore listener error:', err);
  });
}

// ============================================
//  FIRESTORE — CRUD OPERATIONS
// ============================================
async function addTask() {
  const text = taskInput.value.trim();
  if (!text || !currentUser) {
    if (!text) {
      taskInput.classList.add('shake');
      taskInput.focus();
      setTimeout(() => taskInput.classList.remove('shake'), 400);
    }
    return;
  }

  taskInput.value = '';
  taskInput.focus();

  try {
    const tasksRef = collection(db, 'users', currentUser.uid, 'tasks');
    await addDoc(tasksRef, {
      text,
      completed:  false,
      createdAt:  serverTimestamp()
    });
    // onSnapshot will update UI automatically
  } catch (err) {
    console.error('Error adding task:', err);
    // Show error feedback
    taskInput.value = text;
    taskInput.classList.add('shake');
    setTimeout(() => taskInput.classList.remove('shake'), 400);
  }
}

async function toggleTask(id) {
  if (!currentUser) return;
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  const taskDoc = doc(db, 'users', currentUser.uid, 'tasks', id);

  // Animate out first, then update Firestore
  const el = document.querySelector(`.task-item[data-id="${id}"]`);
  if (el) {
    el.classList.add('removing');
    await new Promise(r => setTimeout(r, 280));
  }

  try {
    await updateDoc(taskDoc, { completed: !task.completed });
  } catch (err) {
    console.error('Error toggling task:', err);
  }
}

async function deleteTask(id) {
  if (!currentUser) return;

  const el = document.querySelector(`.task-item[data-id="${id}"]`);
  if (el) {
    el.classList.add('removing');
    await new Promise(r => setTimeout(r, 280));
  }

  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'tasks', id));
  } catch (err) {
    console.error('Error deleting task:', err);
  }
}

// ============================================
//  UI — TASK RENDERING
// ============================================
function createTaskElement(task) {
  const item = document.createElement('div');
  item.className = 'task-item' + (task.completed ? ' completed-item' : '');
  item.dataset.id = task.id;

  // Checkbox
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = task.completed;
  checkbox.id = 'cb-' + task.id;
  checkbox.setAttribute('aria-label', task.completed ? 'Mark as active' : 'Mark as completed');
  checkbox.addEventListener('change', () => toggleTask(task.id));

  // Text
  const text = document.createElement('span');
  text.className = 'task-text';
  text.textContent = task.text;

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'task-delete-btn';
  deleteBtn.id = 'del-' + task.id;
  deleteBtn.setAttribute('aria-label', 'Delete task');
  deleteBtn.innerHTML = `
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
    </svg>`;
  deleteBtn.addEventListener('click', () => deleteTask(task.id));

  item.append(checkbox, text, deleteBtn);
  return item;
}

function renderTasks() {
  const active    = tasks.filter(t => !t.completed);
  const completed = tasks.filter(t =>  t.completed);
  const total     = tasks.length;

  activeTaskList.innerHTML    = '';
  completedTaskList.innerHTML = '';

  active.forEach(t    => activeTaskList.appendChild(createTaskElement(t)));
  completed.forEach(t => completedTaskList.appendChild(createTaskElement(t)));

  activeEmptyEl.style.display    = active.length    === 0 ? 'flex' : 'none';
  completedEmptyEl.style.display = completed.length === 0 ? 'flex' : 'none';

  // Dashboard counts
  const pct = total > 0 ? Math.round((completed.length / total) * 100) : 0;

  animateNumber(totalCountEl,   parseInt(totalCountEl.textContent)  || 0, total);
  animateNumber(activeCountEl,  parseInt(activeCountEl.textContent) || 0, active.length);
  completedPercentEl.textContent = pct + '%';

  activeSectionCount.textContent    = active.length;
  completedSectionCount.textContent = completed.length;
}

function animateNumber(el, from, to) {
  if (from === to) return;
  const duration = 300;
  const start    = performance.now();
  function step(now) {
    const p       = Math.min((now - start) / duration, 1);
    const eased   = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ============================================
//  EVENT LISTENERS — TASK INPUT
// ============================================
addTaskBtn.addEventListener('click', addTask);

taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addTask(); }
});
