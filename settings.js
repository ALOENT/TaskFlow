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
let tasks = []; 

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

  onAuthStateChanged(auth, user => {
    if (user) {
      const q = query(collection(db, 'users', user.uid, 'tasks'));
      onSnapshot(q, snapshot => {
        tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (settingsView.style.display !== 'none' && activeTab === 'profile') {
          updateProfileStats(false); // Update without re-triggering skeletons if already open
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

  const initials = user.displayName ? user.displayName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?';

  container.innerHTML = `
    <div class="settings-section">
      <span class="settings-section-title">Public Profile</span>
      
      <div class="profile-header">
        <div class="avatar-upload-container">
          <div class="profile-avatar-large" id="profile-avatar-display">
            ${user.photoURL ? `<img src="${user.photoURL}" alt="Avatar">` : initials}
            <div class="avatar-spinner" id="avatar-spinner" style="display: none;"></div>
          </div>
          <div class="avatar-overlay" id="avatar-upload-trigger" title="Change photo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </div>
          <input type="file" id="avatar-input" style="display:none" accept=".jpg,.jpeg,.png,.webp,.gif">
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
        <label>Email</label>
        <div class="read-only-val">
          <span>${user.email}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-text-muted)"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <span class="settings-section-title">Your Stats</span>
      <div class="stats-row" id="profile-stats-row">
        <div class="stat-item">
          <span class="stat-val" id="stat-total-val"><div class="skeleton-dots"><span></span><span></span><span></span></div></span>
          <span class="stat-label">Total tasks</span>
        </div>
        <div class="stat-item">
          <span class="stat-val" id="stat-completed-val"><div class="skeleton-dots"><span></span><span></span><span></span></div></span>
          <span class="stat-label">Completed tasks</span>
        </div>
        <div class="stat-item">
          <span class="stat-val" id="stat-streak-val"><div class="skeleton-dots"><span></span><span></span><span></span></div></span>
          <span class="stat-label">Day streak</span>
        </div>
      </div>
    </div>
  `;

  // Avatar Upload Logic
  const avatarTrigger = container.querySelector('#avatar-upload-trigger');
  const avatarInput   = container.querySelector('#avatar-input');

  avatarTrigger.addEventListener('click', () => avatarInput.click());
  avatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleAvatarUpload(file);
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
      const sidebarName = document.getElementById('side-user-name');
      if (sidebarName) sidebarName.textContent = newName;
      showToast('Display name updated!', 'success');
      saveBtn.style.display = 'none';
    } catch (err) {
      showToast('Failed to update name', 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  });

  setTimeout(() => updateProfileStats(true), 600);
}

async function handleAvatarUpload(file) {
  const user = auth.currentUser;
  if (!user) return;

  const spinner = document.getElementById('avatar-spinner');
  if (spinner) spinner.style.display = 'flex';

  try {
    // Validation
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      showToast('Invalid file type. Use JPG, PNG, WEBP, or GIF.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('File too large. Max size is 5MB.', 'error');
      return;
    }

    const storageRef = ref(storage, `users/${user.uid}/avatar.jpg`);
    await uploadBytesResumable(storageRef, file);
    
    const downloadURL = await getDownloadURL(storageRef);
    await updateProfile(user, { photoURL: downloadURL });
    
    const avatarHTML = `<img src="${downloadURL}" alt="Avatar">`;
    const profileDisplay = document.getElementById('profile-avatar-display');
    if (profileDisplay) {
      profileDisplay.innerHTML = avatarHTML + `<div class="avatar-spinner" id="avatar-spinner" style="display: none;"></div>`;
    }
    
    // Update all global UI avatars
    const avatarContainers = ['side-user-avatar', 'mobile-user-avatar', 'top-user-avatar'];
    avatarContainers.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = avatarHTML;
    });

    showToast('Profile photo updated!', 'success');
  } catch (error) {
    console.error(error);
    showToast('Upload failed: ' + error.message, 'error');
  } finally {
    const finalSpinner = document.getElementById('avatar-spinner');
    if (finalSpinner) finalSpinner.style.display = 'none';
  }
}

function updateProfileStats(animate = true) {
  const totalValEl     = document.getElementById('stat-total-val');
  const completedValEl = document.getElementById('stat-completed-val');
  const streakValEl    = document.getElementById('stat-streak-val');
  
  if (!totalValEl || !completedValEl || !streakValEl) return;

  const totalTasksCount = tasks.length;
  const completedTasksCount = tasks.filter(t => t.completed).length;
  const streakCount = calculateStreak(tasks);

  // Store in localStorage as backup
  localStorage.setItem(`streak_${auth.currentUser?.uid}`, streakCount);

  if (animate) {
    animateValue(totalValEl, 0, totalTasksCount, 500);
    animateValue(completedValEl, 0, completedTasksCount, 500);
    animateValue(streakValEl, 0, streakCount, 500);
  } else {
    totalValEl.textContent = totalTasksCount;
    completedValEl.textContent = completedTasksCount;
    streakValEl.textContent = streakCount;
  }
}

function animateValue(obj, start, end, duration) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.innerHTML = Math.floor(progress * (end - start) + start);
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

function calculateStreak(allTasks) {
  const user = auth.currentUser;
  if (!user) return 0;

  const completedDates = allTasks
    .filter(t => t.completed && t.createdAt)
    .map(t => {
      const d = t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
      return d.toDateString();
    });

  if (completedDates.length === 0) {
    // Check backup
    const backup = localStorage.getItem(`streak_${user.uid}`);
    return backup ? parseInt(backup, 10) : 0;
  }

  const uniqueDates = Array.from(new Set(completedDates)).map(d => new Date(d));
  uniqueDates.sort((a, b) => b - a); // Newest first

  let streak = 0;
  const today = new Date();
  today.setHours(0,0,0,0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let startDate = today;
  
  // If no task today, check if yesterday had a completion
  if (uniqueDates[0].toDateString() !== today.toDateString()) {
    if (uniqueDates[0].toDateString() === yesterday.toDateString()) {
      startDate = yesterday;
    } else {
      return 0; // Gap of more than 1 day
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





