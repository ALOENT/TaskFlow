import { 
  auth, db, storage, 
  updateProfile, 
  ref, uploadBytesResumable, getDownloadURL,
  collection, query, where, onSnapshot, getDocs,
  onAuthStateChanged
} from './firebase-config.js';

// DOM Refs
const dashboardView   = document.getElementById('dashboard-view');
const settingsView    = document.getElementById('settings-view');
const settingsBtn     = document.getElementById('settings-btn');
const settingsBackBtn = document.getElementById('settings-back-btn');
const settingsContent = document.getElementById('settings-content');
const tabButtons      = document.querySelectorAll('.settings-tab-btn');

let activeTab = 'profile';
let tasks = []; // Local copy for stats

// Initialize Settings
export function initSettings() {
  if (!settingsBtn) return;

  settingsBtn.addEventListener('click', openSettings);
  settingsBackBtn.addEventListener('click', closeSettings);

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });

  // Listen for task changes to update stats
  const unsubscribe = onAuthStateChanged(auth, user => {
    if (user) {
      const q = query(collection(db, 'users', user.uid, 'tasks'));
      onSnapshot(q, snapshot => {
        tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (settingsView.style.display !== 'none' && activeTab === 'profile') {
          updateProfileStats();
        }
      });
    }
  });
}

function openSettings() {
  dashboardView.style.display = 'none';
  settingsView.style.display = 'flex';
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
  switchTab('profile');
}

function closeSettings() {
  settingsView.style.display = 'none';
  dashboardView.style.display = 'flex';
}

function switchTab(tabId) {
  activeTab = tabId;
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  renderTab();
}

function renderTab() {
  settingsContent.innerHTML = '';
  const pane = document.createElement('div');
  pane.className = 'tab-pane';

  switch (activeTab) {
    case 'profile':
      renderProfileTab(pane);
      break;
    default:
      pane.innerHTML = `<div class="settings-section"><h3>${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3><p>Coming soon...</p></div>`;
  }

  settingsContent.appendChild(pane);
}

// ============================================
//  TAB 1 — PROFILE
// ============================================
function renderProfileTab(container) {
  const user = auth.currentUser;
  if (!user) return;

  const createdAt = user.metadata.creationTime 
    ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', { month: 'long', year: 'numeric', day: 'numeric' })
    : 'Unknown';

  container.innerHTML = `
    <div class="settings-section">
      <span class="settings-section-title">Public Profile</span>
      
      <div class="profile-header">
        <div class="avatar-upload-container">
          <div class="profile-avatar-large" id="profile-avatar-display">
            ${user.photoURL ? `<img src="${user.photoURL}" alt="Avatar">` : (user.displayName ? user.displayName.charAt(0).toUpperCase() : '?')}
          </div>
          <div class="avatar-overlay" id="avatar-upload-trigger" title="Change photo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </div>
          <input type="file" id="avatar-input" style="display:none" accept="image/*">
          <div class="upload-progress-bar" id="avatar-progress-bar">
            <div class="upload-progress-fill" id="avatar-progress-fill"></div>
          </div>
        </div>
        <div class="profile-info">
          <h3 id="profile-display-name-text" style="font-size: 1.5rem; font-weight: 700; margin-bottom: 4px;">${user.displayName || 'Anonymous'}</h3>
          <p style="color: var(--color-text-secondary); font-size: 0.875rem;">Member since ${createdAt}</p>
        </div>
      </div>

      <div class="profile-row">
        <label>Display Name</label>
        <div class="profile-input-group">
          <input type="text" id="profile-name-input" class="form-input" value="${user.displayName || ''}" placeholder="Your display name">
          <button id="save-profile-name" class="primary-btn" style="display:none;">Save</button>
        </div>
      </div>

      <div class="profile-row">
        <label>Email Address</label>
        <div class="read-only-val">
          <span>${user.email}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-text-muted)"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <span class="settings-section-title">Your Stats</span>
      <div class="stats-row" id="profile-stats-row">
        <!-- Injected by updateProfileStats -->
        <div class="stat-item"><span class="stat-val">...</span><span class="stat-label">Total Tasks</span></div>
        <div class="stat-item"><span class="stat-val">...</span><span class="stat-label">Completed</span></div>
        <div class="stat-item"><span class="stat-val">...</span><span class="stat-label">Streak</span></div>
      </div>
    </div>
  `;

  // Avatar Upload Logic
  const avatarTrigger = container.querySelector('#avatar-upload-trigger');
  const avatarInput   = container.querySelector('#avatar-input');
  const progressBg    = container.querySelector('#avatar-progress-bar');
  const progressFill  = container.querySelector('#avatar-progress-fill');

  avatarTrigger.addEventListener('click', () => avatarInput.click());
  avatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleAvatarUpload(file, progressBg, progressFill);
  });

  // Name Editing Logic
  const nameInput = container.querySelector('#profile-name-input');
  const saveBtn   = container.querySelector('#save-profile-name');
  
  nameInput.addEventListener('input', () => {
    saveBtn.style.display = nameInput.value.trim() !== (user.displayName || '') ? 'block' : 'none';
  });

  saveBtn.addEventListener('click', async () => {
    const newName = nameInput.value.trim();
    if (!newName) return;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      await updateProfile(user, { displayName: newName });
      document.getElementById('profile-display-name-text').textContent = newName;
      
      // Update sidebar name if exists
      const sidebarName = document.getElementById('side-user-name');
      if (sidebarName) sidebarName.textContent = newName;
      
      showToast('Display name updated!', 'success');
      saveBtn.style.display = 'none';
    } catch (err) {
      console.error(err);
      showToast('Failed to update name', 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  });

  updateProfileStats();
}

async function handleAvatarUpload(file, progressBg, progressFill) {
  const user = auth.currentUser;
  if (!user) return;

  if (file.size > 2 * 1024 * 1024) {
    showToast('Image must be under 2MB', 'error');
    return;
  }

  const storageRef = ref(storage, `users/${user.uid}/avatar.jpg`);
  const uploadTask = uploadBytesResumable(storageRef, file);

  progressBg.style.display = 'block';

  uploadTask.on('state_changed', 
    (snapshot) => {
      const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
      progressFill.style.width = progress + '%';
    }, 
    (error) => {
      console.error(error);
      showToast('Upload failed', 'error');
      progressBg.style.display = 'none';
    }, 
    async () => {
      const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
      await updateProfile(user, { photoURL: downloadURL });
      
      // Update displays
      const img = `<img src="${downloadURL}" alt="Avatar">`;
      document.getElementById('profile-avatar-display').innerHTML = img;
      
      const sideAvatar = document.getElementById('side-user-avatar');
      if (sideAvatar) sideAvatar.innerHTML = img;
      
      const mobAvatar = document.getElementById('mobile-user-avatar');
      if (mobAvatar) mobAvatar.innerHTML = img;

      showToast('Profile photo updated!', 'success');
      progressBg.style.display = 'none';
      progressFill.style.width = '0%';
    }
  );
}

function updateProfileStats() {
  const statsRow = document.getElementById('profile-stats-row');
  if (!statsRow) return;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.completed).length;
  
  // Calculate Streak
  // Simple streak: days with at least 1 completed task
  const streak = calculateStreak(tasks);

  statsRow.innerHTML = `
    <div class="stat-item"><span class="stat-val">${totalTasks}</span><span class="stat-label">Total Tasks</span></div>
    <div class="stat-item"><span class="stat-val">${completedTasks}</span><span class="stat-label">Completed</span></div>
    <div class="stat-item"><span class="stat-val">${streak}</span><span class="stat-label">Day Streak</span></div>
  `;
}

function calculateStreak(allTasks) {
  const completedDates = allTasks
    .filter(t => t.completed && t.createdAt)
    .map(t => {
      const d = t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
      return d.toDateString();
    });

  if (completedDates.length === 0) return 0;

  const uniqueDates = Array.from(new Set(completedDates)).map(d => new Date(d));
  uniqueDates.sort((a, b) => b - a); // Newest first

  let streak = 0;
  const today = new Date();
  today.setHours(0,0,0,0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let startDate = today;
  
  // If no task today, but task yesterday, start counting from yesterday
  if (uniqueDates[0].toDateString() !== today.toDateString()) {
    if (uniqueDates[0].toDateString() === yesterday.toDateString()) {
      startDate = yesterday;
    } else {
      return 0; // Streak broken
    }
  }

  for (let i = 0; i < uniqueDates.length; i++) {
    const expected = new Date(startDate);
    expected.setDate(expected.getDate() - i);
    if (uniqueDates[i].toDateString() === expected.toDateString()) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// Toast Utility
export function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}


