// ============================================
//  TaskFlow — App Logic (Firebase Auth + Firestore)
//  Categories: Work, Personal, Shopping, Health, Other
//  Tasks stored at: users/{uid}/tasks/{taskId}
// ============================================

import {
  auth, db, googleProvider,
  signInWithPopup, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile,
  collection, addDoc, deleteDoc, doc, updateDoc, writeBatch,
  query, orderBy, onSnapshot, serverTimestamp
} from './firebase-config.js';

import {
  scheduleTaskReminder, cancelTaskReminder,
  rescheduleAllReminders, registerServiceWorker
} from './notifications.js';

import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.css';
import { sanitize } from './sanitize.js';

// ============================================
//  CATEGORIES
// ============================================
const CATEGORIES = [
  { id: 'all',      label: 'All',      icon: '📋' },
  { id: 'work',     label: 'Work',     icon: '💼' },
  { id: 'personal', label: 'Personal', icon: '🏠' },
  { id: 'shopping', label: 'Shopping', icon: '🛒' },
  { id: 'health',   label: 'Health',   icon: '💪' },
  { id: 'other',    label: 'Other',    icon: '📌' }
];

// ============================================
//  DOM REFERENCES
// ============================================
const $ = id => document.getElementById(id);
const loadingOverlay    = $('loading-overlay');
const authScreen        = $('auth-screen');
const appContainer      = $('app-container');
const tabSignin         = $('tab-signin');
const tabSignup         = $('tab-signup');
const googleBtn         = $('google-btn');
const authForm          = $('auth-form');
const nameGroup         = $('name-group');
const confirmGroup      = $('confirm-group');
const authName          = $('auth-name');
const authEmail         = $('auth-email');
const authPassword      = $('auth-password');
const authConfirm       = $('auth-confirm');
const authError         = $('auth-error');
const authSubmit        = $('auth-submit');
const authSubmitText    = $('auth-submit-text');
const btnSpinner        = $('btn-spinner');
const togglePassword    = $('toggle-password');
const eyeIcon           = $('eye-icon');
const userAvatar        = $('user-avatar');
const userName          = $('user-name');
const userEmail         = $('user-email');
const signoutBtn        = $('signout-btn');
const themeToggleBtn    = $('theme-toggle-btn');
const taskInput         = $('task-input');
const taskNotesInput    = $('task-notes-input');
const toggleNotesBtn    = $('toggle-notes-btn');
const addTaskBtn        = $('add-task-btn');
const categorySelect    = $('category-select');
const prioritySelect    = $('priority-select');
const recurrenceSelect  = $('recurrence-select');
const searchInput       = $('search-input');
const searchClearBtn    = $('search-clear-btn');
const reminderInput     = $('reminder-input');
const activeTaskList    = $('active-task-list');
const completedTaskList = $('completed-task-list');
const totalCountEl      = $('total-count');
const highCountEl       = $('high-count');
const overdueCountEl    = $('overdue-count');
const todayCountEl      = $('today-count');
const completedPercentEl = $('completed-percentage');
const progressCircle    = $('progress-circle');
const activeSectionCount = $('active-section-count');
const completedSectionCount = $('completed-section-count');
const activeEmptyEl     = $('active-empty');
const completedEmptyEl  = $('completed-empty');
const categoryTabs      = $('category-tabs');
const bottomNav         = $('bottom-nav');
const skeletonLoader    = $('skeleton-loader');

// ============================================
//  STATE
// ============================================
let currentUser = null;
let tasks = [];
let unsubscribeTasks = null;
let isSignupMode = false;
let activeCategory = 'all';
let searchQuery = '';
let initialLoadDone = false;
let overdueIntervalId = null;

// ============================================
//  UI HELPERS
// ============================================
function showLoading()  { loadingOverlay.classList.remove('hidden'); }
function hideLoading()  { loadingOverlay.classList.add('hidden'); }
function showApp()      { authScreen.style.display = 'none'; appContainer.style.display = ''; }
function showAuth()     { authScreen.style.display = ''; appContainer.style.display = 'none'; }

function setAuthLoading(loading) {
  authSubmit.disabled = loading;
  googleBtn.disabled = loading;
  btnSpinner.style.display = loading ? '' : 'none';
  authSubmitText.style.display = loading ? 'none' : '';
}

function showAuthError(msg) { authError.textContent = msg; authError.style.display = ''; }
function clearAuthError()   { authError.style.display = 'none'; authError.textContent = ''; }

function showSkeleton() { if (skeletonLoader) skeletonLoader.style.display = ''; }
function hideSkeleton() { if (skeletonLoader) skeletonLoader.style.display = 'none'; }

// ============================================
//  THEME TOGGLE
// ============================================
const savedTheme = localStorage.getItem('taskflow-theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
updateThemeIcon(savedTheme);

if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', () => {
    document.body.classList.add('theme-transitioning');
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('taskflow-theme', newTheme);
    updateThemeIcon(newTheme);
    setTimeout(() => {
      document.body.classList.remove('theme-transitioning');
    }, 400);
  });
}

function updateThemeIcon(theme) {
  if (!themeToggleBtn) return;
  if (theme === 'dark') {
    themeToggleBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sun-icon"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
  } else {
    themeToggleBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="moon-icon"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
  }
}

// ============================================
//  AUTH MODE SWITCHING
// ============================================
function setMode(signup) {
  isSignupMode = signup;
  clearAuthError();
  tabSignin.classList.toggle('active', !signup);
  tabSignup.classList.toggle('active', signup);
  tabSignin.setAttribute('aria-selected', String(!signup));
  tabSignup.setAttribute('aria-selected', String(signup));
  nameGroup.style.display = signup ? '' : 'none';
  confirmGroup.style.display = signup ? '' : 'none';
  authSubmitText.textContent = signup ? 'Create Account' : 'Sign In';
  authPassword.autocomplete = signup ? 'new-password' : 'current-password';
}

tabSignin.addEventListener('click', () => setMode(false));
tabSignup.addEventListener('click', () => setMode(true));

togglePassword.addEventListener('click', () => {
  const isText = authPassword.type === 'text';
  authPassword.type = isText ? 'password' : 'text';
  eyeIcon.innerHTML = isText
    ? `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`
    : `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
});

// ============================================
//  AUTH ERROR MESSAGES
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
  const email = authEmail.value.trim();
  const password = authPassword.value;
  const name = authName.value.trim();
  const confirm = authConfirm.value;

  if (!email || !password) { showAuthError('Please fill in all fields.'); return; }
  if (isSignupMode && !name) { showAuthError('Please enter your name.'); return; }
  if (isSignupMode && password !== confirm) { showAuthError('Passwords do not match.'); return; }
  if (isSignupMode && password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }

  setAuthLoading(true);
  try {
    if (isSignupMode) {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
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
  if (overdueIntervalId) { clearInterval(overdueIntervalId); overdueIntervalId = null; }
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
    initialLoadDone = false;
    showSkeleton();
    subscribeToTasks(user.uid);
    // Register service worker for web notifications
    registerServiceWorker();

    if (!overdueIntervalId) {
      overdueIntervalId = setInterval(() => { if (currentUser && tasks.length > 0) renderTasks(); }, 60000);
    }
  } else {
    if (unsubscribeTasks) { unsubscribeTasks(); unsubscribeTasks = null; }
    if (overdueIntervalId) { clearInterval(overdueIntervalId); overdueIntervalId = null; }
    currentUser = null;
    tasks = [];
    initialLoadDone = false;
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
//  HEADER USER INFO
// ============================================
function updateHeaderUI(user) {
  const displayName = user.displayName || user.email.split('@')[0];
  const email = user.email;
  userName.textContent = displayName;
  userEmail.textContent = email;
  if (user.photoURL) {
    userAvatar.innerHTML = `<img src="${user.photoURL}" alt="${displayName}" referrerpolicy="no-referrer">`;
  } else {
    const initials = displayName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    userAvatar.textContent = initials;
  }
}

// ============================================
//  CATEGORY TABS (Desktop + Bottom Nav Mobile)
// ============================================
function renderCategoryTabs() {
  // Desktop tabs
  if (categoryTabs) {
    categoryTabs.innerHTML = CATEGORIES.map(c => `
      <button class="cat-tab${c.id === activeCategory ? ' active' : ''}" data-cat="${c.id}">
        <span class="cat-icon">${c.icon}</span>
        <span class="cat-label">${c.label}</span>
      </button>
    `).join('');
    categoryTabs.querySelectorAll('.cat-tab').forEach(btn => {
      btn.addEventListener('click', () => switchCategory(btn.dataset.cat));
    });
  }
  // Mobile bottom nav
  if (bottomNav) {
    bottomNav.innerHTML = CATEGORIES.map(c => `
      <button class="bottom-nav-item${c.id === activeCategory ? ' active' : ''}" data-cat="${c.id}">
        <span class="bottom-nav-icon">${c.icon}</span>
        <span class="bottom-nav-label">${c.label}</span>
      </button>
    `).join('');
    bottomNav.querySelectorAll('.bottom-nav-item').forEach(btn => {
      btn.addEventListener('click', () => switchCategory(btn.dataset.cat));
    });
  }
}

function switchCategory(catId) {
  activeCategory = catId;
  renderCategoryTabs();
  renderTasks();
}

// Initialize category tabs
renderCategoryTabs();

// ============================================
//  FLATPICKR CONFIGURATION
// ============================================
const getFlatpickrConfig = (defaultDate = null) => ({
  enableTime: true,
  dateFormat: "Z",
  altInput: true,
  altFormat: "M j, Y h:i K",
  disableMobile: true, // Force custom UI instead of native picker
  defaultDate: defaultDate,
  onReady: function(selectedDates, dateStr, instance) {
    const btnContainer = document.createElement('div');
    btnContainer.className = 'flatpickr-actions';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'flatpickr-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      if (instance._previousDate) {
        instance.setDate(instance._previousDate, false);
      } else {
        instance.clear();
      }
      instance.close();
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'flatpickr-confirm-btn';
    confirmBtn.textContent = 'Confirm';
    confirmBtn.addEventListener('click', () => {
      instance.close();
    });

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(confirmBtn);
    instance.calendarContainer.appendChild(btnContainer);
  },
  onOpen: function(selectedDates, dateStr, instance) {
    // Capture the confirmed date before user starts picking
    instance._previousDate = instance.selectedDates.length > 0 ? instance.selectedDates[0] : null;
  }
});

let mainReminderPicker = null;

// Initialize the main add-task reminder picker
if (reminderInput) {
  mainReminderPicker = flatpickr(reminderInput, getFlatpickrConfig());
}

// ============================================
//  FIRESTORE — REAL-TIME LISTENER
// ============================================
function subscribeToTasks(uid) {
  if (unsubscribeTasks) unsubscribeTasks();
  const tasksRef = collection(db, 'users', uid, 'tasks');
  const q = query(tasksRef, orderBy('createdAt', 'desc'));

  unsubscribeTasks = onSnapshot(q, async (snapshot) => {
    tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // On first load, reschedule all pending reminders
    if (!initialLoadDone) {
      initialLoadDone = true;
      hideSkeleton();
      try {
        await rescheduleAllReminders(tasks);
      } catch (err) {
        console.warn('Failed to reschedule reminders:', err);
      }
    }
    renderTasks();
  }, (err) => {
    console.error('Firestore listener error:', err);
    hideSkeleton();
  });
}

// ============================================
//  FIRESTORE — CRUD
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

  const category = categorySelect ? categorySelect.value : 'other';
  const reminderTime = mainReminderPicker && mainReminderPicker.selectedDates.length > 0 
    ? mainReminderPicker.selectedDates[0].toISOString() 
    : null;

  taskInput.value = '';
  if (taskNotesInput) {
    taskNotesInput.value = '';
    taskNotesInput.style.display = 'none';
    if (toggleNotesBtn) toggleNotesBtn.style.display = 'block';
  }
  if (mainReminderPicker) mainReminderPicker.clear();
  taskInput.focus();

  try {
    // Prepare task data
    const taskData = {
      text: sanitize(text),
      notes: taskNotesInput && taskNotesInput.style.display !== 'none' ? sanitize(taskNotesInput.value.trim()) : '',
      category,
      priority: prioritySelect ? prioritySelect.value : 'medium',
      subtasks: [],
      completed: false,
      recurrence: recurrenceSelect ? recurrenceSelect.value : 'none',
      reminderTime,
      notificationId: null,
      order: Date.now(),
      createdAt: serverTimestamp()
    };

    const tasksRef = collection(db, 'users', currentUser.uid, 'tasks');
    const docRef = await addDoc(tasksRef, taskData);

    // Schedule notification if reminder is set
    if (reminderTime) {
      const notifId = await scheduleTaskReminder({ id: docRef.id, title: text, reminderTime });
      if (notifId != null) {
        await updateDoc(doc(db, 'users', currentUser.uid, 'tasks', docRef.id), { notificationId: notifId });
      }
    }
  } catch (err) {
    console.error('Error adding task:', err);
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
  const el = document.querySelector(`.task-item[data-id="${id}"]`);
  if (el) { el.classList.add('removing'); await new Promise(r => setTimeout(r, 280)); }

  try {
    const newCompleted = !task.completed;
    await updateDoc(taskDoc, { completed: newCompleted });

    // Handle Recurring Task
    if (newCompleted && task.recurrence && task.recurrence !== 'none') {
      await handleRecurrence(task);
    }

    // Cancel notification when completing
    if (newCompleted && task.notificationId != null) {
      await cancelTaskReminder(task.notificationId, task.id);
      await updateDoc(taskDoc, { notificationId: null });
    }
    // Reschedule when uncompleting (if reminder is in the future)
    if (!newCompleted && task.reminderTime && new Date(task.reminderTime) > new Date()) {
      const notifId = await scheduleTaskReminder({ id: task.id, title: task.text, reminderTime: task.reminderTime });
      if (notifId != null) {
        await updateDoc(taskDoc, { notificationId: notifId });
      }
    }
  } catch (err) {
    console.error('Error toggling task:', err);
  }
}

async function deleteTask(id) {
  if (!currentUser) return;
  const task = tasks.find(t => t.id === id);

  const el = document.querySelector(`.task-item[data-id="${id}"]`);
  if (el) { el.classList.add('removing'); await new Promise(r => setTimeout(r, 280)); }

  try {
    // Cancel notification before deleting
    if (task && task.notificationId != null) {
      await cancelTaskReminder(task.notificationId, task.id);
    }
    await deleteDoc(doc(db, 'users', currentUser.uid, 'tasks', id));
  } catch (err) {
    console.error('Error deleting task:', err);
  }
}

// ============================================
//  INLINE EDIT — save changes
// ============================================
async function saveEdit(id, newText, newNotes, newReminder, newCategory, newPriority, newRecurrence) {
  if (!currentUser) return;
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  const taskDoc = doc(db, 'users', currentUser.uid, 'tasks', id);
  const updates = {};

  if (newText !== undefined && newText !== task.text) updates.text = sanitize(newText);
  if (newNotes !== undefined && newNotes !== (task.notes || '')) updates.notes = sanitize(newNotes);
  if (newRecurrence !== undefined && newRecurrence !== task.recurrence) updates.recurrence = newRecurrence;
  if (newCategory !== undefined && newCategory !== task.category) updates.category = newCategory;
  if (newPriority !== undefined && newPriority !== task.priority) updates.priority = newPriority;

  // Handle reminder time change
  const oldReminder = task.reminderTime || null;
  let newReminderISO = null;
  if (newReminder) {
    const d = new Date(newReminder);
    if (!isNaN(d.getTime())) {
      newReminderISO = d.toISOString();
    }
  }

  if (newReminderISO !== oldReminder) {
    updates.reminderTime = newReminderISO;

    // Cancel old notification
    if (task.notificationId != null) {
      await cancelTaskReminder(task.notificationId, task.id);
      updates.notificationId = null;
    }

    // Schedule new notification if reminder is set and in the future
    if (newReminderISO && new Date(newReminderISO) > new Date() && !task.completed) {
      const notifId = await scheduleTaskReminder({
        id: task.id,
        title: newText || task.text,
        reminderTime: newReminderISO
      });
      if (notifId != null) updates.notificationId = notifId;
    }
  }

  if (Object.keys(updates).length > 0) {
    try {
      await updateDoc(taskDoc, updates);
    } catch (err) {
      console.error('Error saving edit:', err);
    }
  }
}

// ============================================
//  SUBTASKS
// ============================================
async function addSubtask(taskId, text) {
  if (!currentUser) return;
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  
  const subtasks = task.subtasks || [];
  const newSubtask = { id: Date.now().toString(), text: sanitize(text), completed: false };
  const updatedSubtasks = [...subtasks, newSubtask];
  
  await updateDoc(doc(db, 'users', currentUser.uid, 'tasks', taskId), { subtasks: updatedSubtasks });
}

async function toggleSubtask(taskId, subtaskId) {
  if (!currentUser) return;
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  
  const subtasks = task.subtasks || [];
  const updatedSubtasks = subtasks.map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s);
  
  const updates = { subtasks: updatedSubtasks };
  
  const allCompleted = updatedSubtasks.length > 0 && updatedSubtasks.every(s => s.completed);
  if (allCompleted && !task.completed) {
    updates.completed = true;
    if (task.notificationId != null) {
      await cancelTaskReminder(task.notificationId, task.id);
      updates.notificationId = null;
    }
    // Handle recurrence when completing via subtasks
    if (task.recurrence && task.recurrence !== 'none') {
      await handleRecurrence(task);
    }
  }
  
  await updateDoc(doc(db, 'users', currentUser.uid, 'tasks', taskId), updates);
}

async function deleteSubtask(taskId, subtaskId) {
  if (!currentUser) return;
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  
  const subtasks = task.subtasks || [];
  const updatedSubtasks = subtasks.filter(s => s.id !== subtaskId);
  
  await updateDoc(doc(db, 'users', currentUser.uid, 'tasks', taskId), { subtasks: updatedSubtasks });
}

// ============================================
//  RECURRING TASKS HELPER
// ============================================
async function handleRecurrence(task) {
  if (!currentUser) return;
  const nextDate = new Date();
  
  if (task.recurrence === 'daily') nextDate.setDate(nextDate.getDate() + 1);
  else if (task.recurrence === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
  else if (task.recurrence === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
  else return;

  let nextReminder = null;
  if (task.reminderTime) {
    const originalReminder = new Date(task.reminderTime);
    nextReminder = new Date(nextDate);
    nextReminder.setHours(originalReminder.getHours(), originalReminder.getMinutes(), 0, 0);
  }

  const taskData = {
    text: task.text,
    notes: task.notes || '',
    category: task.category,
    priority: task.priority || 'medium',
    recurrence: task.recurrence,
    subtasks: (task.subtasks || []).map(s => ({ ...s, completed: false })),
    completed: false,
    reminderTime: nextReminder ? nextReminder.toISOString() : null,
    notificationId: null,
    order: Date.now(),
    createdAt: serverTimestamp()
  };

  const tasksRef = collection(db, 'users', currentUser.uid, 'tasks');
  const docRef = await addDoc(tasksRef, taskData);

  if (nextReminder) {
    const notifId = await scheduleTaskReminder({ id: docRef.id, title: task.text, reminderTime: nextReminder.toISOString() });
    if (notifId != null) {
      await updateDoc(doc(db, 'users', currentUser.uid, 'tasks', docRef.id), { notificationId: notifId });
    }
  }
}

// ============================================
//  TASK RENDERING
// ============================================
function isOverdue(task) {
  return task.reminderTime && !task.completed && new Date(task.reminderTime) < new Date();
}

function formatReminderTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function createTaskElement(task) {
  const item = document.createElement('div');
  item.className = 'task-item' + (task.completed ? ' completed-item' : '') + (isOverdue(task) ? ' overdue-item' : '');
  item.dataset.id = task.id;

  // Checkbox
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = task.completed;
  checkbox.id = 'cb-' + task.id;
  checkbox.setAttribute('aria-label', task.completed ? 'Mark as active' : 'Mark as completed');
  checkbox.addEventListener('change', () => toggleTask(task.id));

  // Content wrapper
  const content = document.createElement('div');
  content.className = 'task-content';

  // Text
  const text = document.createElement('span');
  text.className = 'task-text';
  text.textContent = task.text;
  content.appendChild(text);

  if (task.notes) {
    const notesDisplay = document.createElement('div');
    notesDisplay.className = 'task-notes-display visible';
    notesDisplay.textContent = task.notes;
    content.appendChild(notesDisplay);
  }

  // Meta row (category + reminder)
  const meta = document.createElement('div');
  meta.className = 'task-meta';

  const catObj = CATEGORIES.find(c => c.id === task.category) || CATEGORIES[5];
  const catBadge = document.createElement('span');
  catBadge.className = 'task-category-badge';
  catBadge.textContent = `${catObj.icon} ${catObj.label}`;
  meta.appendChild(catBadge);

  const priority = task.priority || 'medium';
  const priorityIcons = { high: '🔴', medium: '🟠', low: '🟢' };
  const priorityBadge = document.createElement('span');
  priorityBadge.className = `task-category-badge priority-${priority}`;
  priorityBadge.textContent = `${priorityIcons[priority]} ${priority.charAt(0).toUpperCase() + priority.slice(1)}`;
  meta.appendChild(priorityBadge);

  if (task.recurrence && task.recurrence !== 'none') {
    const recBadge = document.createElement('span');
    recBadge.className = 'task-category-badge';
    recBadge.innerHTML = `🔁 ${task.recurrence}`;
    meta.appendChild(recBadge);
  }

  if (task.reminderTime) {
    const reminderBadge = document.createElement('span');
    reminderBadge.className = 'task-reminder-badge' + (isOverdue(task) ? ' overdue' : '');
    reminderBadge.textContent = isOverdue(task) ? `⏰ Overdue` : `🔔 ${formatReminderTime(task.reminderTime)}`;
    meta.appendChild(reminderBadge);
  }

  if (task.subtasks && task.subtasks.length > 0) {
    const total = task.subtasks.length;
    const completed = task.subtasks.filter(s => s.completed).length;
    const progressBadge = document.createElement('span');
    progressBadge.className = 'task-category-badge subtask-badge';
    progressBadge.textContent = `📋 ${completed}/${total}`;
    meta.appendChild(progressBadge);
  }

  content.appendChild(meta);

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'task-actions';

  // Edit button
  const editBtn = document.createElement('button');
  editBtn.className = 'task-action-btn task-edit-btn';
  editBtn.id = 'edit-' + task.id;
  editBtn.setAttribute('aria-label', 'Edit task');
  editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  editBtn.addEventListener('click', () => toggleEditMode(task));

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'task-action-btn task-delete-btn';
  deleteBtn.id = 'del-' + task.id;
  deleteBtn.setAttribute('aria-label', 'Delete task');
  deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
  deleteBtn.addEventListener('click', () => deleteTask(task.id));

  // Subtasks toggle button
  const subtasksBtn = document.createElement('button');
  subtasksBtn.className = 'task-action-btn subtasks-btn';
  subtasksBtn.setAttribute('aria-label', 'Toggle Subtasks');
  subtasksBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
  subtasksBtn.addEventListener('click', () => {
    const container = item.querySelector('.subtasks-container');
    if (container) {
      container.style.display = container.style.display === 'none' ? 'block' : 'none';
      subtasksBtn.querySelector('polyline').setAttribute('points', container.style.display === 'none' ? "6 9 12 15 18 9" : "18 15 12 9 6 15");
    }
  });

  actions.append(subtasksBtn, editBtn, deleteBtn);
  
  // Subtasks container
  const subtasksContainer = document.createElement('div');
  subtasksContainer.className = 'subtasks-container';
  subtasksContainer.style.display = 'none';

  const subtasksList = document.createElement('div');
  subtasksList.className = 'subtasks-list';
  (task.subtasks || []).forEach(sub => {
    const subItem = document.createElement('div');
    subItem.className = 'subtask-item' + (sub.completed ? ' subtask-completed' : '');
    
    const subCb = document.createElement('input');
    subCb.type = 'checkbox';
    subCb.className = 'subtask-checkbox';
    subCb.checked = sub.completed;
    subCb.addEventListener('change', () => toggleSubtask(task.id, sub.id));
    
    const subText = document.createElement('span');
    subText.className = 'subtask-text';
    subText.textContent = sub.text;
    
    const subDel = document.createElement('button');
    subDel.className = 'subtask-delete-btn';
    subDel.innerHTML = '×';
    subDel.addEventListener('click', () => deleteSubtask(task.id, sub.id));
    
    subItem.append(subCb, subText, subDel);
    subtasksList.appendChild(subItem);
  });

  const addSubDiv = document.createElement('div');
  addSubDiv.className = 'add-subtask-div';
  const subInput = document.createElement('input');
  subInput.type = 'text';
  subInput.className = 'add-subtask-input';
  subInput.placeholder = 'Add subtask...';
  subInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && subInput.value.trim()) {
      e.preventDefault();
      addSubtask(task.id, subInput.value.trim());
    }
  });
  addSubDiv.appendChild(subInput);
  
  subtasksContainer.append(subtasksList, addSubDiv);

  item.append(checkbox, content, actions, subtasksContainer);

  // Drag and Drop
  item.draggable = true;
  item.addEventListener('dragstart', handleDragStart);
  item.addEventListener('dragover', handleDragOver);
  item.addEventListener('drop', handleDrop);
  item.addEventListener('dragenter', handleDragEnter);
  item.addEventListener('dragleave', handleDragLeave);
  item.addEventListener('dragend', handleDragEnd);

  return item;
}

// ============================================
//  DRAG AND DROP HANDLERS
// ============================================
let draggedTaskId = null;

function handleDragStart(e) {
  draggedTaskId = this.dataset.id;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedTaskId);
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter(e) {
  this.classList.add('drag-over');
}

function handleDragLeave(e) {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  e.stopPropagation();
  this.classList.remove('drag-over');
  const targetTaskId = this.dataset.id;
  if (draggedTaskId && draggedTaskId !== targetTaskId) {
    reorderTasks(draggedTaskId, targetTaskId);
  }
  return false;
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.task-item').forEach(i => i.classList.remove('drag-over'));
  draggedTaskId = null;
}

async function reorderTasks(draggedId, targetId) {
  if (!currentUser) return;
  const listEls = Array.from(activeTaskList.children);
  const draggedEl = activeTaskList.querySelector(`[data-id="${draggedId}"]`);
  const targetEl = activeTaskList.querySelector(`[data-id="${targetId}"]`);
  
  if (!draggedEl || !targetEl) return;

  const draggedIndex = listEls.indexOf(draggedEl);
  const targetIndex = listEls.indexOf(targetEl);

  if (draggedIndex < targetIndex) {
    targetEl.after(draggedEl);
  } else {
    targetEl.before(draggedEl);
  }

  const newOrderNodes = Array.from(activeTaskList.children);
  const now = Date.now();
  
  const newOrders = new Map();
  newOrderNodes.forEach((node, index) => {
    newOrders.set(node.dataset.id, now + index);
  });

  const batch = writeBatch(db);
  newOrders.forEach((newOrder, id) => {
    const taskRef = doc(db, 'users', currentUser.uid, 'tasks', id);
    batch.update(taskRef, { order: newOrder });
  });

  try {
    await batch.commit();
    // Only update local state after successful commit
    newOrders.forEach((newOrder, id) => {
      const t = tasks.find(t => t.id === id);
      if (t) t.order = newOrder;
    });
  } catch (err) {
    console.error('Reorder failed:', err);
    renderTasks(); // Revert UI
  }
}

// ============================================
//  INLINE EDIT MODE
// ============================================
function toggleEditMode(task) {
  const item = document.querySelector(`.task-item[data-id="${task.id}"]`);
  if (!item) return;

  // If already in edit mode, close it
  if (item.querySelector('.edit-form')) {
    renderTasks();
    return;
  }

  // Replace content with inline edit form
  const content = item.querySelector('.task-content');
  if (!content) return;

  const editForm = document.createElement('div');
  editForm.className = 'edit-form';

  // Title input
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'edit-title-input';
  titleInput.value = task.text;
  titleInput.maxLength = 120;

  // Notes input
  const notesInput = document.createElement('textarea');
  notesInput.className = 'task-notes-input';
  notesInput.style.marginTop = '0';
  notesInput.rows = 2;
  notesInput.value = task.notes || '';
  notesInput.placeholder = 'Add notes (optional)...';

  // Recurrence select
  const recSelect = document.createElement('select');
  recSelect.className = 'edit-category-select';
  const recOptions = [
    { value: 'none', label: '🔁 None' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' }
  ];
  recOptions.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.value;
    opt.textContent = r.label;
    if (r.value === (task.recurrence || 'none')) opt.selected = true;
    recSelect.appendChild(opt);
  });

  // Priority select
  const priSelect = document.createElement('select');
  priSelect.className = 'edit-category-select';
  const priOptions = [
    { value: 'high', label: '🔴 High' },
    { value: 'medium', label: '🟠 Medium' },
    { value: 'low', label: '🟢 Low' }
  ];
  priOptions.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.value;
    opt.textContent = p.label;
    if (p.value === (task.priority || 'medium')) opt.selected = true;
    priSelect.appendChild(opt);
  });

  // Category select
  const catSelect = document.createElement('select');
  catSelect.className = 'edit-category-select';
  CATEGORIES.filter(c => c.id !== 'all').forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.icon} ${c.label}`;
    if (c.id === task.category) opt.selected = true;
    catSelect.appendChild(opt);
  });

  // Reminder input (Flatpickr)
  const remInput = document.createElement('input');
  remInput.type = 'text';
  remInput.className = 'edit-reminder-input';
  remInput.placeholder = 'Set a reminder...';
  
  let initialDate = null;
  if (task.reminderTime) {
    initialDate = new Date(task.reminderTime);
  }
  
  const editPicker = flatpickr(remInput, getFlatpickrConfig(initialDate));

  // Button row
  const btnRow = document.createElement('div');
  btnRow.className = 'edit-btn-row';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'edit-save-btn';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', async () => {
    const newRem = editPicker.selectedDates.length > 0 ? editPicker.selectedDates[0].toISOString() : null;
    await saveEdit(task.id, titleInput.value.trim(), notesInput.value.trim(), newRem, catSelect.value, priSelect.value, recSelect.value);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'edit-cancel-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => renderTasks());

  const clearRemBtn = document.createElement('button');
  clearRemBtn.className = 'edit-clear-rem-btn';
  clearRemBtn.textContent = '🔕 Clear Reminder';
  clearRemBtn.addEventListener('click', () => { editPicker.clear(); });

  btnRow.append(saveBtn, cancelBtn);

  editForm.append(titleInput, notesInput, priSelect, recSelect, catSelect, remInput, clearRemBtn, btnRow);
  content.replaceWith(editForm);

  titleInput.focus();
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveBtn.click(); }
    if (e.key === 'Escape') cancelBtn.click();
  });
}

// ============================================
//  RENDER TASKS
// ============================================
function renderTasks() {
  // Filter by active category
  let filtered = activeCategory === 'all' ? tasks : tasks.filter(t => t.category === activeCategory);
  
  // Filter by search query
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(t => 
      t.text.toLowerCase().includes(q) || 
      (t.subtasks && t.subtasks.some(s => s.text.toLowerCase().includes(q)))
    );
  }
  
  // Sort tasks by priority
  const priorityWeight = { high: 3, medium: 2, low: 1 };
  filtered.sort((a, b) => {
    const pA = priorityWeight[a.priority || 'medium'];
    const pB = priorityWeight[b.priority || 'medium'];
    if (pA !== pB) return pB - pA;
    
    const oA = a.order || (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0);
    const oB = b.order || (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0);
    return oA - oB;
  });

  const active = filtered.filter(t => !t.completed);
  const completed = filtered.filter(t => t.completed);
  const total = filtered.length;

  activeTaskList.innerHTML = '';
  completedTaskList.innerHTML = '';

  active.forEach(t => activeTaskList.appendChild(createTaskElement(t)));
  completed.forEach(t => completedTaskList.appendChild(createTaskElement(t)));

  activeEmptyEl.style.display = active.length === 0 ? 'flex' : 'none';
  completedEmptyEl.style.display = completed.length === 0 ? 'flex' : 'none';

  // Advanced Stats
  const highTasks = tasks.filter(t => !t.completed && t.priority === 'high');
  const overdueTasks = tasks.filter(t => isOverdue(t));
  const today = new Date().toDateString();
  const todayTasks = tasks.filter(t => !t.completed && t.reminderTime && new Date(t.reminderTime).toDateString() === today);
  
  const pct = total > 0 ? Math.round((completed.length / total) * 100) : 0;
  
  animateNumber(totalCountEl, parseInt(totalCountEl.textContent) || 0, total);
  animateNumber(highCountEl, parseInt(highCountEl.textContent) || 0, highTasks.length);
  animateNumber(overdueCountEl, parseInt(overdueCountEl.textContent) || 0, overdueTasks.length);
  animateNumber(todayCountEl, parseInt(todayCountEl.textContent) || 0, todayTasks.length);
  
  completedPercentEl.textContent = pct + '%';
  activeSectionCount.textContent = active.length;
  completedSectionCount.textContent = completed.length;

  // Update Progress Ring
  if (progressCircle) {
    const radius = parseFloat(progressCircle.getAttribute('r'));
    const circumference = 2 * Math.PI * radius;
    progressCircle.style.strokeDasharray = circumference;
    const offset = circumference - (pct / 100) * circumference;
    progressCircle.style.strokeDashoffset = offset;
  }
}

function animateNumber(el, from, to) {
  if (from === to) return;
  const duration = 300;
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ============================================
//  EVENT LISTENERS
// ============================================
addTaskBtn.addEventListener('click', addTask);
taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addTask(); }
});

if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    searchClearBtn.style.display = searchQuery ? 'block' : 'none';
    renderTasks();
  });
}
if (searchClearBtn) {
  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClearBtn.style.display = 'none';
    renderTasks();
  });
}

if (toggleNotesBtn) {
  toggleNotesBtn.addEventListener('click', () => {
    toggleNotesBtn.style.display = 'none';
    taskNotesInput.style.display = 'block';
    taskNotesInput.focus();
  });
}

