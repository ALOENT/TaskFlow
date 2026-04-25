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
import { initSettings } from './settings.js';

initSettings();

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

// Updated User DOM Refs
const sideUserAvatar    = $('side-user-avatar');
const sideUserName      = $('side-user-name');
const sideUserEmail     = $('side-user-email');
const topUserAvatar     = $('top-user-avatar');
const pageTitle         = $('page-title');

// Sidebar Nav Refs
const sideSignoutBtn    = $('side-signout-btn');
const sidebarNav        = document.querySelector('.sidebar-nav');
const sidebarCategories = $('sidebar-categories');

// Top Bar Search
const topSearchInput    = $('top-search-input');

const themeToggleBtn    = $('theme-toggle-btn');
const taskInput         = $('task-input');
const taskNotesInput    = $('task-notes-input');
const toggleNotesBtn    = $('toggle-notes-btn');
const addTaskBtn        = $('add-task-btn');
const categorySelect    = $('category-select');
const prioritySelect    = $('priority-select');
const recurrenceSelect  = $('recurrence-select');
const reminderInput     = $('reminder-input');
const activeTaskList    = $('active-task-list');
const completedTaskList = $('completed-task-list');
const totalCountEl      = $('total-count');
const highCountEl       = $('high-count');
const overdueCountEl    = $('overdue-count');
const todayCountEl      = $('today-count');
const completedPercentEl = $('completed-percentage');
const progressBarInner  = $('progress-bar-inner');
const skeletonLoader    = $('skeleton-loader');
const bottomNav         = $('bottom-nav');

// Mobile Refs
const menuBtn           = $('menu-btn');
const sidebar           = $('sidebar');
const sidebarOverlay    = $('sidebar-overlay');
const mobileThemeToggle = $('mobile-theme-toggle');
const mobileUserAvatar  = $('mobile-user-avatar');
const userFirstName     = $('user-first-name');
const currentDateEl     = $('current-date');
const mobileProgCount   = $('mobile-progress-count');
const mobileProgFill    = $('mobile-progress-fill');
const fabBtn            = $('fab-btn');
const bottomSheet       = $('bottom-sheet');
const sheetOverlay      = $('bottom-sheet-overlay');
const sheetTaskInput    = $('sheet-task-input');
const sheetPriority     = $('sheet-priority-select');
const sheetCategory     = $('sheet-category-select');
const sheetReminder     = $('sheet-reminder-input');
const sheetRecurrence   = $('sheet-recurrence-select');
const sheetToggleNotes  = $('sheet-toggle-notes');
const sheetNotesInput   = $('sheet-notes-input');
const sheetAddTaskBtn   = $('sheet-add-task-btn');

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
  themeToggleBtn.addEventListener('click', toggleTheme);
}
if (mobileThemeToggle) {
  mobileThemeToggle.addEventListener('click', toggleTheme);
}

function toggleTheme() {
  document.body.classList.add('theme-transitioning');
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('taskflow-theme', newTheme);
  updateThemeIcon(newTheme);
  setTimeout(() => {
    document.body.classList.remove('theme-transitioning');
  }, 400);
}

function updateThemeIcon(theme) {
  const moonIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="moon-icon"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
  const sunIcon  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sun-icon"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  
  if (themeToggleBtn) themeToggleBtn.innerHTML = theme === 'dark' ? sunIcon : moonIcon;
  if (mobileThemeToggle) mobileThemeToggle.innerHTML = theme === 'dark' ? sunIcon : moonIcon;
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
sideSignoutBtn.addEventListener('click', async () => {
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
  const email = user.email || '';
  const displayName = user.displayName || (email ? email.split('@')[0] : 'User');
  const firstName = displayName.split(' ')[0];
  
  sideUserName.textContent = displayName;
  sideUserEmail.textContent = email;
  if (userFirstName) userFirstName.textContent = firstName;
  
  const initials = displayName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  
  const avatarHTML = user.photoURL 
    ? `<img src="${user.photoURL}" alt="${displayName}" referrerpolicy="no-referrer" style="width:100%;height:100%;border-radius:inherit;object-fit:cover;">`
    : initials;

  if (sideUserAvatar) {
    if (user.photoURL) sideUserAvatar.innerHTML = avatarHTML;
    else sideUserAvatar.textContent = initials;
  }
  if (topUserAvatar) {
    if (user.photoURL) topUserAvatar.innerHTML = avatarHTML;
    else topUserAvatar.textContent = initials;
  }
  if (mobileUserAvatar) {
    if (user.photoURL) mobileUserAvatar.innerHTML = avatarHTML;
    else mobileUserAvatar.textContent = initials;
  }
  
  updateCurrentDate();
}

function updateCurrentDate() {
  if (currentDateEl) {
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    currentDateEl.textContent = new Date().toLocaleDateString('en-US', options);
  }
}

// ============================================
//  CATEGORY TABS (Desktop + Bottom Nav Mobile)
// ============================================
function renderCategoryTabs() {
  // Sidebar categories
  if (sidebarCategories) {
    sidebarCategories.innerHTML = CATEGORIES.filter(c => c.id !== 'all').map(c => {
      const count = tasks.filter(t => !t.completed && t.category === c.id).length;
      return `
        <li class="nav-item${c.id === activeCategory ? ' active' : ''}" data-nav="${c.id}">
          <span class="cat-icon">${c.icon}</span>
          <span>${c.label}</span>
          ${count > 0 ? `<span class="cat-badge">${count}</span>` : ''}
        </li>
      `;
    }).join('');
    
    sidebarCategories.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => switchCategory(btn.dataset.nav));
    });
  }

  // Update Primary Nav Counts (All, Today, etc)
  const todayStr = new Date().toDateString();
  const now = new Date();
  
  const allCount = tasks.filter(t => !t.completed).length;
  const todayCount = tasks.filter(t => !t.completed && t.reminderTime && new Date(t.reminderTime).toDateString() === todayStr).length;
  const upcomingCount = tasks.filter(t => !t.completed && t.reminderTime && new Date(t.reminderTime) > now).length;
  const completedCount = tasks.filter(t => t.completed).length;

  const counts = { 'all': allCount, 'today': todayCount, 'upcoming': upcomingCount, 'completed': completedCount };

  document.querySelectorAll('.sidebar-nav .nav-list:first-child .nav-item').forEach(item => {
    const nav = item.dataset.nav;
    const badge = item.querySelector('.cat-badge');
    if (badge) {
      const c = counts[nav];
      badge.textContent = c;
      badge.style.display = c > 0 ? 'block' : 'none';
    }
  });

  // Mobile bottom nav (5 tabs: All, Today, Upcoming, Completed, Stats)
  if (bottomNav) {
    const mobileTabs = [
      { id: 'all',       label: 'All',       icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' },
      { id: 'today',     label: 'Today',     icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
      { id: 'upcoming',  label: 'Upcoming',  icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
      { id: 'completed', label: 'Done',      icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' },
      { id: 'stats',     label: 'Stats',     icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>' }
    ];

    bottomNav.innerHTML = mobileTabs.map(t => `
      <button class="bottom-nav-item${t.id === activeCategory ? ' active' : ''}" data-nav="${t.id}">
        <span class="bottom-nav-icon">${t.icon}</span>
        <span class="bottom-nav-label">${t.label}</span>
      </button>
    `).join('');

    bottomNav.querySelectorAll('.bottom-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.nav === 'stats') {
          const statsGrid = $('stats-grid');
          if (statsGrid) statsGrid.scrollIntoView({ behavior: 'smooth' });
          // Highlight stats tab visually without corrupting filter state
          bottomNav.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        } else {
          switchCategory(btn.dataset.nav);
        }
      });
    });
  }
}

function switchCategory(catId) {
  activeCategory = catId;
  
  // Update sidebar active states
  document.querySelectorAll('.sidebar .nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.nav === catId);
  });

  // Update page title
  if (pageTitle) {
    const navItem = CATEGORIES.find(c => c.id === catId);
    if (navItem) {
      pageTitle.textContent = navItem.label + (catId === 'all' ? ' Tasks' : '');
    } else {
      const virtuals = { 'today': 'Today', 'upcoming': 'Upcoming', 'completed': 'Completed' };
      pageTitle.textContent = virtuals[catId] || 'Tasks';
    }
  }

  renderCategoryTabs();
  renderTasks();
}

// Sidebar Primary Nav Listeners
document.querySelectorAll('.sidebar-nav .nav-list:first-child .nav-item').forEach(item => {
  item.addEventListener('click', () => switchCategory(item.dataset.nav));
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      switchCategory(item.dataset.nav);
    }
  });
});

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
let sheetReminderPicker = null;

// Initialize the main add-task reminder picker
if (reminderInput) {
  mainReminderPicker = flatpickr(reminderInput, getFlatpickrConfig());
}
if (sheetReminder) {
  sheetReminderPicker = flatpickr(sheetReminder, getFlatpickrConfig());
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
    const noteUI = document.getElementById('note-ui-container');
    if (noteUI) noteUI.style.display = 'none';
    if (toggleNotesBtn) {
      toggleNotesBtn.style.display = 'inline-block';
      toggleNotesBtn.innerHTML = '📝 Add Note';
      toggleNotesBtn.classList.remove('has-note');
    }
  }
  if (mainReminderPicker) mainReminderPicker.clear();
  taskInput.focus();

  try {
    // Prepare task data
    const taskData = {
      text: sanitize(text),
      notes: taskNotesInput && taskNotesInput.value.trim() ? sanitize(taskNotesInput.value.trim()) : '',
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
  item.className = 'task-item';
  item.dataset.id = task.id;
  item.dataset.priority = task.priority || 'none';
  if (task.completed) item.classList.add('completed');
  if (isOverdue(task)) item.classList.add('overdue-item');

  const cat = CATEGORIES.find(c => c.id === task.category) || CATEGORIES[5];
  const subtasksCount = task.subtasks ? task.subtasks.length : 0;
  const completedSubtasks = task.subtasks ? task.subtasks.filter(s => s.completed).length : 0;
  const isOverdueTask = isOverdue(task);

  const prioLabel = (task.priority||'medium').charAt(0).toUpperCase()+(task.priority||'medium').slice(1);
  const prioIcon = {high:'🔴',medium:'🟠',low:'🟢'}[task.priority||'medium'];

  item.innerHTML = `
    <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
    <div class="task-content">
      <div class="task-text">${task.text}</div>
      <div class="task-meta">
        <span class="task-category-badge">${cat.icon} ${cat.label}</span>
        <span class="task-category-badge priority-${task.priority || 'medium'}">${prioIcon} ${prioLabel}</span>
        ${subtasksCount > 0 ? `<span class="task-category-badge subtask-badge">${completedSubtasks}/${subtasksCount} subtasks</span>` : ''}
        ${task.reminderTime ? `<span class="task-reminder-badge${isOverdueTask ? ' overdue' : ''}">${isOverdueTask ? '⏰ Overdue' : '🔔 ' + formatReminderTime(task.reminderTime)}</span>` : ''}
        ${task.recurrence && task.recurrence !== 'none' ? '<span class="task-category-badge">🔁</span>' : ''}
        ${task.notes ? '<span class="task-category-badge">📝</span>' : ''}
      </div>
    </div>
    <div class="task-actions">
      <button class="action-btn subtasks-btn" title="Toggle Subtasks">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <button class="action-btn edit-btn" title="Edit">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="action-btn delete-btn" title="Delete">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>
    <div class="subtasks-container" style="display: none;">
      <div class="subtasks-list"></div>
      <div class="add-subtask-div">
        <input type="text" class="add-subtask-input" placeholder="Add subtask...">
      </div>
    </div>
  `;

  // Attach event listeners
  const checkbox = item.querySelector('.task-checkbox');
  checkbox.addEventListener('change', () => toggleTask(task.id));

  const editBtn = item.querySelector('.edit-btn');
  editBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleEditMode(task); });

  const deleteBtn = item.querySelector('.delete-btn');
  deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteTask(task.id); });

  const subBtn = item.querySelector('.subtasks-btn');
  const subContainer = item.querySelector('.subtasks-container');
  const subList = item.querySelector('.subtasks-list');
  const subInput = item.querySelector('.add-subtask-input');

  subBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = subContainer.style.display === 'none';
    subContainer.style.display = isHidden ? 'block' : 'none';
    subBtn.querySelector('polyline').setAttribute('points', isHidden ? "18 15 12 9 6 15" : "6 9 12 15 18 9");
  });

  (task.subtasks || []).forEach(sub => {
    const subItem = document.createElement('div');
    subItem.className = 'subtask-item' + (sub.completed ? ' subtask-completed' : '');
    subItem.innerHTML = `
      <input type="checkbox" class="subtask-checkbox" ${sub.completed ? 'checked' : ''}>
      <span class="subtask-text">${sub.text}</span>
      <button class="subtask-delete-btn">×</button>
    `;
    subItem.querySelector('.subtask-checkbox').addEventListener('change', () => toggleSubtask(task.id, sub.id));
    subItem.querySelector('.subtask-delete-btn').addEventListener('click', () => deleteSubtask(task.id, sub.id));
    subList.appendChild(subItem);
  });

  subInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && subInput.value.trim()) {
      e.preventDefault();
      addSubtask(task.id, subInput.value.trim());
    }
  });

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
  const todayStr = new Date().toDateString();
  const now = new Date();

  // Filter by active category/view
  let filtered = tasks;

  if (activeCategory === 'today') {
    filtered = tasks.filter(t => !t.completed && t.reminderTime && new Date(t.reminderTime).toDateString() === todayStr);
  } else if (activeCategory === 'upcoming') {
    filtered = tasks.filter(t => !t.completed && t.reminderTime && new Date(t.reminderTime) > now);
  } else if (activeCategory === 'completed') {
    filtered = tasks.filter(t => t.completed);
  } else if (activeCategory !== 'all') {
    filtered = tasks.filter(t => t.category === activeCategory);
  }
  
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

  // Decide what to show in sections
  let active, completed;
  if (activeCategory === 'completed') {
    active = [];
    completed = filtered;
  } else {
    active = filtered.filter(t => !t.completed);
    completed = filtered.filter(t => t.completed);
  }

  activeTaskList.innerHTML = '';
  completedTaskList.innerHTML = '';

  active.forEach(t => activeTaskList.appendChild(createTaskElement(t)));
  completed.forEach(t => completedTaskList.appendChild(createTaskElement(t)));

  const activeEmptyEl = $('active-empty');
  const completedEmptyEl = $('completed-empty');
  if (activeEmptyEl) activeEmptyEl.style.display = active.length === 0 ? 'flex' : 'none';
  if (completedEmptyEl) completedEmptyEl.style.display = completed.length === 0 ? 'flex' : 'none';

  // Stats
  const totalTasks = tasks.length;
  const highTasks = tasks.filter(t => !t.completed && t.priority === 'high');
  const overdueTasks = tasks.filter(t => isOverdue(t));
  const todayTasks = tasks.filter(t => !t.completed && t.reminderTime && new Date(t.reminderTime).toDateString() === todayStr);
  const completedCount = tasks.filter(t => t.completed).length;
  
  const pct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
  
  animateNumber(totalCountEl, parseInt(totalCountEl.textContent) || 0, totalTasks);
  animateNumber(highCountEl, parseInt(highCountEl.textContent) || 0, highTasks.length);
  animateNumber(overdueCountEl, parseInt(overdueCountEl.textContent) || 0, overdueTasks.length);
  animateNumber(todayCountEl, parseInt(todayCountEl.textContent) || 0, todayTasks.length);
  
  completedPercentEl.textContent = pct + '%';
  if (progressBarInner) progressBarInner.style.width = pct + '%';
  
  if (mobileProgCount) {
    mobileProgCount.textContent = `${completedCount} of ${totalTasks} tasks`;
  }
  if (mobileProgFill) {
    mobileProgFill.style.width = pct + '%';
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

if (topSearchInput) {
  topSearchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderTasks();
  });
}

// Note UI Setup
function setupNoteUI(toggleBtn, containerEl, textareaEl, cancelBtn, doneBtn) {
  if (!toggleBtn || !containerEl) return;
  
  const openNote = () => {
    containerEl.style.display = 'block';
    toggleBtn.style.display = 'none';
    if (textareaEl) textareaEl.focus();
  };
  
  const closeNote = () => {
    containerEl.style.display = 'none';
    toggleBtn.style.display = 'inline-block';
    if (textareaEl.value.trim() !== '') {
      toggleBtn.innerHTML = '📝 Note added';
      toggleBtn.classList.add('has-note');
    } else {
      toggleBtn.innerHTML = '📝 Add Note';
      toggleBtn.classList.remove('has-note');
    }
  };

  toggleBtn.addEventListener('click', openNote);
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      textareaEl.value = '';
      closeNote();
    });
  }
  if (doneBtn) {
    doneBtn.addEventListener('click', closeNote);
  }
}

setupNoteUI(
  toggleNotesBtn,
  document.getElementById('note-ui-container'),
  taskNotesInput,
  document.getElementById('note-cancel-btn'),
  document.getElementById('note-done-btn')
);

setupNoteUI(
  sheetToggleNotes,
  document.getElementById('sheet-note-ui-container'),
  sheetNotesInput,
  document.getElementById('sheet-note-cancel-btn'),
  document.getElementById('sheet-note-done-btn')
);

// Mobile Sidebar Drawer
if (menuBtn && sidebar && sidebarOverlay) {
  const toggleSidebar = () => {
    sidebar.classList.toggle('open');
    sidebarOverlay.classList.toggle('active');
  };
  menuBtn.addEventListener('click', toggleSidebar);
  sidebarOverlay.addEventListener('click', toggleSidebar);
}

// Mobile Bottom Sheet / FAB
if (fabBtn && bottomSheet && sheetOverlay) {
  const toggleSheet = () => {
    bottomSheet.classList.toggle('active');
    sheetOverlay.classList.toggle('active');
  };
  fabBtn.addEventListener('click', toggleSheet);
  sheetOverlay.addEventListener('click', toggleSheet);
  
  // Sheet drag handle to close
  const handle = bottomSheet.querySelector('.sheet-handle');
  if (handle) {
    handle.addEventListener('click', toggleSheet);
    let startY = 0;
    handle.addEventListener('touchstart', e => startY = e.touches[0].clientY, { passive: true });
    handle.addEventListener('touchend', e => {
      if (e.changedTouches[0].clientY > startY + 30) toggleSheet();
    }, { passive: true });
  }
}

// Add Task from Bottom Sheet
async function addSheetTask() {
  const text = sheetTaskInput.value.trim();
  if (!text || !currentUser) {
    if (!text) {
      sheetTaskInput.classList.add('shake');
      sheetTaskInput.focus();
      setTimeout(() => sheetTaskInput.classList.remove('shake'), 400);
    }
    return;
  }

  const category = sheetCategory ? sheetCategory.value : 'other';
  const reminderTime = sheetReminderPicker && sheetReminderPicker.selectedDates.length > 0 
    ? sheetReminderPicker.selectedDates[0].toISOString() 
    : null;

  const sheetNotes = sheetNotesInput && sheetNotesInput.value.trim() ? sheetNotesInput.value.trim() : '';

  sheetTaskInput.value = '';
  if (sheetNotesInput) {
    sheetNotesInput.value = '';
    const sheetNoteUI = document.getElementById('sheet-note-ui-container');
    if (sheetNoteUI) sheetNoteUI.style.display = 'none';
    if (sheetToggleNotes) {
      sheetToggleNotes.style.display = 'inline-block';
      sheetToggleNotes.innerHTML = '📝 Add Note';
      sheetToggleNotes.classList.remove('has-note');
    }
  }
  if (sheetReminderPicker) sheetReminderPicker.clear();
  
  if (bottomSheet) bottomSheet.classList.remove('active');
  if (sheetOverlay) sheetOverlay.classList.remove('active');

  try {
    const taskData = {
      text: sanitize(text),
      notes: sheetNotes ? sanitize(sheetNotes) : '',
      category,
      priority: sheetPriority ? sheetPriority.value : 'medium',
      subtasks: [],
      completed: false,
      recurrence: sheetRecurrence ? sheetRecurrence.value : 'none',
      reminderTime,
      notificationId: null,
      order: Date.now(),
      createdAt: serverTimestamp()
    };

    const tasksRef = collection(db, 'users', currentUser.uid, 'tasks');
    const docRef = await addDoc(tasksRef, taskData);

    if (reminderTime) {
      const notifId = await scheduleTaskReminder({ id: docRef.id, title: text, reminderTime });
      if (notifId != null) {
        await updateDoc(doc(db, 'users', currentUser.uid, 'tasks', docRef.id), { notificationId: notifId });
      }
    }
  } catch (err) {
    console.error('Error adding sheet task:', err);
    sheetTaskInput.value = text;
    sheetTaskInput.classList.add('shake');
    setTimeout(() => sheetTaskInput.classList.remove('shake'), 400);
  }
}

if (sheetAddTaskBtn) {
  sheetAddTaskBtn.addEventListener('click', addSheetTask);
}
if (sheetTaskInput) {
  sheetTaskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addSheetTask(); }
  });
}

// Custom Dropdown Builder
function buildCustomDropdown(selectId) {
  const selectEl = document.getElementById(selectId);
  if (!selectEl) return;

  const container = document.createElement('div');
  container.className = 'custom-dropdown-container';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-dropdown-trigger';
  trigger.innerHTML = `
    <span class="trigger-label">${selectEl.options[selectEl.selectedIndex].text}</span>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
  `;

  const menu = document.createElement('ul');
  menu.className = 'custom-dropdown-menu';
  
  const options = Array.from(selectEl.options);
  options.forEach((opt, idx) => {
    const li = document.createElement('li');
    li.className = 'custom-dropdown-option' + (opt.selected ? ' selected' : '');
    li.dataset.value = opt.value;
    li.innerHTML = `
      ${opt.text}
      <svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    `;
    li.addEventListener('click', () => {
      selectEl.selectedIndex = idx;
      trigger.querySelector('.trigger-label').textContent = opt.text;
      menu.querySelectorAll('.custom-dropdown-option').forEach(item => item.classList.remove('selected'));
      li.classList.add('selected');
      closeMenu();
      selectEl.dispatchEvent(new Event('change'));
    });
    menu.appendChild(li);
  });

  const openMenu = (e) => {
    e.stopPropagation();
    document.querySelectorAll('.custom-dropdown-menu.open').forEach(m => m.classList.remove('open'));
    menu.classList.add('open');
  };

  const closeMenu = () => {
    menu.classList.remove('open');
  };

  trigger.addEventListener('click', (e) => {
    if (menu.classList.contains('open')) closeMenu();
    else openMenu(e);
  });

  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  selectEl.style.display = 'none';
  selectEl.parentNode.insertBefore(container, selectEl);
  container.appendChild(selectEl);
  container.appendChild(trigger);
  container.appendChild(menu);
}

buildCustomDropdown('recurrence-select');
buildCustomDropdown('sheet-recurrence-select');
buildCustomDropdown('priority-select');
buildCustomDropdown('sheet-priority-select');
buildCustomDropdown('category-select');
buildCustomDropdown('sheet-category-select');

