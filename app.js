// ============================================
//  TaskFlow — App Logic (Firebase Auth + Firestore)
//  Categories: Work, Personal, Shopping, Health, Other
//  Tasks stored at: users/{uid}/tasks/{taskId}
// ============================================

import {
  auth, db, googleProvider,
  signInWithPopup, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile,
  collection, addDoc, deleteDoc, doc, updateDoc,
  query, orderBy, onSnapshot, serverTimestamp
} from './firebase-config.js';

import {
  scheduleTaskReminder, cancelTaskReminder,
  rescheduleAllReminders, registerServiceWorker
} from './notifications.js';

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
const taskInput         = $('task-input');
const addTaskBtn        = $('add-task-btn');
const categorySelect    = $('category-select');
const reminderInput     = $('reminder-input');
const activeTaskList    = $('active-task-list');
const completedTaskList = $('completed-task-list');
const totalCountEl      = $('total-count');
const activeCountEl     = $('active-count');
const completedPercentEl = $('completed-percentage');
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
  const reminderTime = reminderInput && reminderInput.value ? new Date(reminderInput.value).toISOString() : null;

  taskInput.value = '';
  if (reminderInput) reminderInput.value = '';
  taskInput.focus();

  try {
    // Prepare task data
    const taskData = {
      text,
      category,
      completed: false,
      reminderTime,
      notificationId: null,
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
async function saveEdit(id, newText, newReminder, newCategory) {
  if (!currentUser) return;
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  const taskDoc = doc(db, 'users', currentUser.uid, 'tasks', id);
  const updates = {};

  if (newText !== undefined && newText !== task.text) updates.text = newText;
  if (newCategory !== undefined && newCategory !== task.category) updates.category = newCategory;

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

  // Meta row (category + reminder)
  const meta = document.createElement('div');
  meta.className = 'task-meta';

  const catObj = CATEGORIES.find(c => c.id === task.category) || CATEGORIES[5];
  const catBadge = document.createElement('span');
  catBadge.className = 'task-category-badge';
  catBadge.textContent = `${catObj.icon} ${catObj.label}`;
  meta.appendChild(catBadge);

  if (task.reminderTime) {
    const reminderBadge = document.createElement('span');
    reminderBadge.className = 'task-reminder-badge' + (isOverdue(task) ? ' overdue' : '');
    reminderBadge.textContent = isOverdue(task) ? `⏰ Overdue` : `🔔 ${formatReminderTime(task.reminderTime)}`;
    meta.appendChild(reminderBadge);
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

  actions.append(editBtn, deleteBtn);
  item.append(checkbox, content, actions);
  return item;
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

  // Reminder input
  const remInput = document.createElement('input');
  remInput.type = 'datetime-local';
  remInput.className = 'edit-reminder-input';
  if (task.reminderTime) {
    const d = new Date(task.reminderTime);
    remInput.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  // Button row
  const btnRow = document.createElement('div');
  btnRow.className = 'edit-btn-row';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'edit-save-btn';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', async () => {
    const newText = titleInput.value.trim();
    if (!newText) return;
    await saveEdit(task.id, newText, remInput.value || null, catSelect.value);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'edit-cancel-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => renderTasks());

  const clearRemBtn = document.createElement('button');
  clearRemBtn.className = 'edit-clear-rem-btn';
  clearRemBtn.textContent = '🔕 Clear Reminder';
  clearRemBtn.addEventListener('click', () => { remInput.value = ''; });

  btnRow.append(saveBtn, cancelBtn);

  editForm.append(titleInput, catSelect, remInput, clearRemBtn, btnRow);
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
  const filtered = activeCategory === 'all' ? tasks : tasks.filter(t => t.category === activeCategory);
  const active = filtered.filter(t => !t.completed);
  const completed = filtered.filter(t => t.completed);
  const total = filtered.length;

  activeTaskList.innerHTML = '';
  completedTaskList.innerHTML = '';

  active.forEach(t => activeTaskList.appendChild(createTaskElement(t)));
  completed.forEach(t => completedTaskList.appendChild(createTaskElement(t)));

  activeEmptyEl.style.display = active.length === 0 ? 'flex' : 'none';
  completedEmptyEl.style.display = completed.length === 0 ? 'flex' : 'none';

  const pct = total > 0 ? Math.round((completed.length / total) * 100) : 0;
  animateNumber(totalCountEl, parseInt(totalCountEl.textContent) || 0, total);
  animateNumber(activeCountEl, parseInt(activeCountEl.textContent) || 0, active.length);
  completedPercentEl.textContent = pct + '%';
  activeSectionCount.textContent = active.length;
  completedSectionCount.textContent = completed.length;
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

