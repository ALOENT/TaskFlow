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
let unsubscribeTasks = null;

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function isValidPhotoURL(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

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
    if (unsubscribeTasks) {
      unsubscribeTasks();
      unsubscribeTasks = null;
    }

    if (user) {
      const q = query(collection(db, 'users', user.uid, 'tasks'));
      unsubscribeTasks = onSnapshot(q, snapshot => {
        tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (settingsView.style.display !== 'none' && activeTab === 'profile') {
          updateProfileStats(false);
        }
      });
    } else {
      tasks = [];
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
    case 'appearance':
      renderAppearanceTab(pane);
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

  const displayName = user.displayName || 'Anonymous';
  const email = user.email || '';
  const photoURL = user.photoURL || '';
  const safePhotoURL = isValidPhotoURL(photoURL) ? photoURL : null;

  container.innerHTML = `
    <div class="settings-section">
      <span class="settings-section-title">Public Profile</span>
      
      <div class="profile-header">
        <div class="avatar-upload-container">
          <div class="profile-avatar-large" id="profile-avatar-display">
            ${safePhotoURL ? `<img src="${escapeHtml(safePhotoURL)}" alt="Avatar">` : escapeHtml(initials)}
            <div class="avatar-spinner" id="avatar-spinner" style="display: none;"></div>
          </div>
          <div class="avatar-overlay" id="avatar-upload-trigger" title="Change photo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </div>
          <input type="file" id="avatar-input" style="display:none" accept=".jpg,.jpeg,.png,.webp,.gif">
        </div>
        <div class="profile-info">
          <h3 id="profile-display-name-text" style="font-size: 1.5rem; font-weight: 700; margin-bottom: 4px;">${escapeHtml(displayName)}</h3>
          <p style="color: var(--color-text-secondary); font-size: 0.875rem;">Member since ${escapeHtml(createdAt)}</p>
        </div>
      </div>

      <div class="profile-row">
        <label>Display Name</label>
        <div class="profile-input-group">
          <input type="text" id="profile-name-input" class="form-input" value="${escapeHtml(displayName === 'Anonymous' ? '' : displayName)}" placeholder="Your display name">
          <button id="save-profile-name" class="primary-btn" style="display:none;">Save</button>
        </div>
      </div>

      <div class="profile-row">
        <label>Email</label>
        <div class="read-only-val">
          <span>${escapeHtml(email)}</span>
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

  const inputEl = document.getElementById('avatar-input');
  if (inputEl) inputEl.disabled = true;

  const displayEl = document.getElementById('profile-avatar-display');
  if (displayEl) displayEl.classList.add('loading');

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
    
    const escapedURL = escapeHtml(downloadURL);
    const avatarHTML = `<img src="${escapedURL}" alt="Avatar">`;
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
    const finalAvatar = document.getElementById('profile-avatar-display');
    if (finalAvatar) finalAvatar.classList.remove('loading');

    const finalSpinner = document.getElementById('avatar-spinner');
    if (finalSpinner) finalSpinner.style.display = 'none';

    const finalInput = document.getElementById('avatar-input');
    if (finalInput) finalInput.disabled = false;
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
  if (auth.currentUser?.uid) {
    localStorage.setItem(`streak_${auth.currentUser.uid}`, streakCount);
  }

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

// ============================================
//  TAB 2 — APPEARANCE
// ============================================
function renderAppearanceTab(container) {
  const currentTheme = localStorage.getItem('theme') || localStorage.getItem('taskflow-theme') || 'system';
  const currentAccent = localStorage.getItem('accentColor') || '#2563eb';
  const currentFontSize = localStorage.getItem('fontSize') || '15';
  const currentSidebarPos = localStorage.getItem('sidebarPosition') || 'left';

  container.innerHTML = `
    <div class="settings-section">
      <span class="settings-section-title">Theme Selection</span>
      <div class="appearance-grid theme-grid">
        <div class="appearance-card theme-card ${currentTheme === 'light' ? 'active' : ''}" data-theme-val="light">
          <div class="theme-preview light-preview">
             <div class="preview-header"></div><div class="preview-body"></div>
          </div>
          <span>Light</span>
        </div>
        <div class="appearance-card theme-card ${currentTheme === 'dark' ? 'active' : ''}" data-theme-val="dark">
          <div class="theme-preview dark-preview">
             <div class="preview-header"></div><div class="preview-body"></div>
          </div>
          <span>Dark</span>
        </div>
        <div class="appearance-card theme-card ${currentTheme === 'system' ? 'active' : ''}" data-theme-val="system">
          <div class="theme-preview system-preview">
             <div class="preview-header"></div><div class="preview-body"></div>
          </div>
          <span>System</span>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <span class="settings-section-title">Accent Color</span>
      <div class="accent-swatches">
        ${[
          { color: '#2563eb', name: 'Blue' },
          { color: '#7c3aed', name: 'Purple' },
          { color: '#16a34a', name: 'Green' },
          { color: '#dc2626', name: 'Red' },
          { color: '#ea580c', name: 'Orange' },
          { color: '#db2777', name: 'Pink' }
        ].map(c => `
          <button class="color-swatch ${currentAccent === c.color ? 'active' : ''}" 
                  style="background-color: ${c.color};" 
                  data-color="${c.color}" 
                  aria-label="${c.name}">
             ${currentAccent === c.color ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
          </button>
        `).join('')}
      </div>

      <div class="custom-colors-section" style="margin-top: 24px;">
        <span class="settings-section-title" style="margin-bottom: 12px; display: block;">CUSTOM COLORS</span>
        <div class="custom-accent-container" style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
          <div class="add-custom-color-btn" style="position: relative; width: 40px; height: 40px;">
            <button class="color-swatch-plus" title="Add custom color" style="width: 40px; height: 40px; border-radius: 50%; border: 2px dashed var(--color-text-muted); background: transparent; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--color-text-muted); transition: all 0.2s;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <input type="color" id="custom-accent-input" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;" title="Add custom color">
          </div>
          <div id="custom-swatches-row" style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
            <!-- Custom swatches injected here -->
          </div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <span class="settings-section-title">Font Size</span>
      <div class="font-size-pills">
        <button class="font-size-pill ${currentFontSize === '13' ? 'active' : ''}" data-size="13">Small</button>
        <button class="font-size-pill ${currentFontSize === '15' ? 'active' : ''}" data-size="15">Medium</button>
        <button class="font-size-pill ${currentFontSize === '17' ? 'active' : ''}" data-size="17">Large</button>
      </div>
    </div>

    <div class="settings-section desktop-only-section">
      <span class="settings-section-title">Sidebar Position (Desktop)</span>
      <div class="appearance-grid sidebar-grid">
        <div class="appearance-card sidebar-pos-card ${currentSidebarPos === 'left' ? 'active' : ''}" data-pos="left">
          <div class="layout-preview left-preview">
             <div class="preview-side"></div><div class="preview-main"></div>
          </div>
          <span>Left</span>
        </div>
        <div class="appearance-card sidebar-pos-card ${currentSidebarPos === 'right' ? 'active' : ''}" data-pos="right">
          <div class="layout-preview right-preview">
             <div class="preview-main"></div><div class="preview-side"></div>
          </div>
          <span>Right</span>
        </div>
      </div>
    </div>
  `;

  const themeCards = container.querySelectorAll('.theme-card');
  themeCards.forEach(card => {
    card.addEventListener('click', () => {
      themeCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const val = card.dataset.themeVal;
      localStorage.setItem('theme', val);
      if (val === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      } else {
        document.documentElement.setAttribute('data-theme', val);
      }
    });
  });

  const swatches = container.querySelectorAll('.color-swatch');
  swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      swatches.forEach(s => {
        s.classList.remove('active');
        s.innerHTML = '';
      });
      swatch.classList.add('active');
      swatch.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      const val = swatch.dataset.color;
      localStorage.setItem('accentColor', val);
      document.documentElement.style.setProperty('--color-accent', val);
    });
  });

  const fontPills = container.querySelectorAll('.font-size-pill');
  fontPills.forEach(pill => {
    pill.addEventListener('click', () => {
      fontPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const val = pill.dataset.size;
      localStorage.setItem('fontSize', val);
      document.documentElement.style.setProperty('--base-font-size', val + 'px');
    });
  });

  const sidebarCards = container.querySelectorAll('.sidebar-pos-card');
  sidebarCards.forEach(card => {
    card.addEventListener('click', () => {
      sidebarCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const val = card.dataset.pos;
      localStorage.setItem('sidebarPosition', val);
      const layoutWrapper = document.querySelector('.layout-wrapper');
      if (layoutWrapper) {
        if (val === 'right') {
          layoutWrapper.classList.add('sidebar-right');
        } else {
          layoutWrapper.classList.remove('sidebar-right');
        }
      }
    });
  });

  // CUSTOM COLORS LOGIC
  const customSwatchesRow = container.querySelector('#custom-swatches-row');
  const customAccentInput = container.querySelector('#custom-accent-input');
  
  let customColors = JSON.parse(localStorage.getItem('customAccentColors') || '[]');
  let editingIndex = -1;

  const renderCustomSwatches = () => {
    customSwatchesRow.innerHTML = customColors.map((color, index) => `
      <button class="color-swatch custom-swatch ${currentAccent === color ? 'active' : ''}" 
              style="background-color: ${color};" 
              data-color="${color}" 
              data-index="${index}">
         ${currentAccent === color ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
      </button>
    `).join('');

    const swatches = customSwatchesRow.querySelectorAll('.custom-swatch');
    swatches.forEach(swatch => {
      let pressTimer;
      const index = parseInt(swatch.dataset.index);
      const color = swatch.dataset.color;

      // Click to apply
      swatch.addEventListener('click', (e) => {
        if (e.detail > 1) return; // Ignore double clicks if needed
        applyColor(color);
      });

      // Context menu for Edit/Remove
      swatch.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.pageX, e.pageY, index, color);
      });

      // Long press for mobile
      swatch.addEventListener('touchstart', (e) => {
        pressTimer = setTimeout(() => showContextMenu(e.touches[0].pageX, e.touches[0].pageY, index, color), 600);
      }, {passive: true});
      swatch.addEventListener('touchend', () => clearTimeout(pressTimer));
    });
  };

  const applyColor = (color) => {
    localStorage.setItem('accentColor', color);
    document.documentElement.style.setProperty('--color-accent', color);
    // Refresh UI
    renderTab(); 
  };

  const showContextMenu = (x, y, index, color) => {
    // Remove existing
    const existing = document.querySelector('.color-context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'color-context-menu';
    menu.style.cssText = `
      position: fixed;
      top: ${y}px;
      left: ${x}px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      min-width: 100px;
    `;

    menu.innerHTML = `
      <div class="menu-item" id="edit-color" style="padding: 8px 12px; cursor: pointer; border-radius: 4px; font-size: 0.85rem; font-weight: 600; color: var(--color-text-primary);">Edit</div>
      <div class="menu-item" id="remove-color" style="padding: 8px 12px; cursor: pointer; border-radius: 4px; font-size: 0.85rem; font-weight: 600; color: var(--color-danger);">Remove</div>
    `;

    document.body.appendChild(menu);

    // Adjust position if it goes off screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + 'px';

    menu.querySelector('#edit-color').addEventListener('click', () => {
      editingIndex = index;
      customAccentInput.value = color;
      customAccentInput.click();
      menu.remove();
    });

    menu.querySelector('#remove-color').addEventListener('click', () => {
      customColors.splice(index, 1);
      localStorage.setItem('customAccentColors', JSON.stringify(customColors));
      renderCustomSwatches();
      menu.remove();
    });

    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('mousedown', closeMenu);
      }
    };
    document.addEventListener('mousedown', closeMenu);
  };

  customAccentInput.addEventListener('input', (e) => {
    const val = e.target.value;
    if (editingIndex === -1) {
      // Just preview maybe? User said "picked and confirmed"
    }
  });

  customAccentInput.addEventListener('change', (e) => {
    const val = e.target.value;
    if (editingIndex !== -1) {
      customColors[editingIndex] = val;
      editingIndex = -1;
    } else {
      // Add new
      if (customColors.includes(val)) {
        // Already exists, just apply
      } else {
        if (customColors.length >= 5) {
          customColors.shift(); // Remove oldest
        }
        customColors.push(val);
      }
    }
    localStorage.setItem('customAccentColors', JSON.stringify(customColors));
    applyColor(val);
    renderCustomSwatches();
  });

  renderCustomSwatches();
}
