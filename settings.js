import { 
  auth, db, 
  updateProfile, 
  collection, query, where, onSnapshot, getDocs,
  addDoc, deleteDoc, writeBatch, doc,
  updateDoc,
  onAuthStateChanged, serverTimestamp,
  updatePassword, reauthenticateWithCredential, reauthenticateWithPopup, EmailAuthProvider,
  signOut, googleProvider, signInWithPopup,
  getDoc, setDoc
} from './firebase-config.js';
import { sanitize } from './sanitize.js';

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

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// Global modal listeners
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal('import-modal');
    closeModal('delete-modal');
  }
});

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}



export function generateInitialsAvatar(name, size) {
  const s = size || 40;
  const initials = (name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(n => n[0].toUpperCase())
    .slice(0, 2)
    .join('');
  
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  
  // Background: accent color
  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-accent')
    .trim() || '#2563eb';
  
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(s/2, s/2, s/2, 0, Math.PI*2);
  ctx.fill();
  
  // Text: white initials
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${s * 0.38}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, s/2, s/2);
  
  return canvas.toDataURL();
}

// ============================================
//  HELPERS
// ============================================
function isValidHexColor(color) {
  return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(color);
}

function getSafeAvatarUrl(photoURL, displayName, size) {
  if (!photoURL) return generateInitialsAvatar(displayName, size);
  try {
    const url = new URL(photoURL);
    if (['http:', 'https:'].includes(url.protocol) || photoURL.startsWith('data:image/')) {
      return photoURL;
    }
  } catch (e) {
    if (photoURL.startsWith('data:image/')) return photoURL;
  }
  return generateInitialsAvatar(displayName, size);
}

export function refreshAllAvatars() {
  const user = auth.currentUser;
  if (!user) return;

  const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'User');
  const photoURL = user.photoURL;

  const avatars = document.querySelectorAll('[data-avatar]');
  avatars.forEach(el => {
    const size = parseInt(el.dataset.size) || 40;
    const url = getSafeAvatarUrl(photoURL, displayName, size);
    el.innerHTML = '';
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Avatar';
    img.referrerPolicy = 'no-referrer';
    img.style.cssText = 'width: 100%; height: 100%; border-radius: 50%; object-fit: cover;';
    el.appendChild(img);
  });

  // Account tab might have its own specific container if it doesn't use data-avatar
  const accountAvatar = document.getElementById('account-avatar-container');
  if (accountAvatar) {
    const size = 64;
    const url = getSafeAvatarUrl(photoURL, displayName, size);
    accountAvatar.innerHTML = '';
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Avatar';
    img.referrerPolicy = 'no-referrer';
    img.style.cssText = 'width: 100%; height: 100%; border-radius: 50%; object-fit: cover;';
    accountAvatar.appendChild(img);
  }
}

export function initSettings() {
  if (!settingsBtn) return;

  settingsBtn.addEventListener('click', openSettings);
  if (settingsBackBtn) {
    settingsBackBtn.addEventListener('click', closeSettings);
  }

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
      refreshAllAvatars();
      const q = query(collection(db, 'users', user.uid, 'tasks'));
      unsubscribeTasks = onSnapshot(q, snapshot => {
        tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (settingsView.style.display !== 'none' && activeTab === 'profile') {
          updateProfileStats(false);
        }
      }, error => {
        console.error("Tasks subscription error:", error);
        tasks = [];
        if (settingsView.style.display !== 'none' && activeTab === 'profile') {
          updateProfileStats(false);
        }
      });
    } else {
      tasks = [];
    }
  });
}

export function openSettings() {
  dashboardView.style.display = 'none';
  settingsView.style.display = 'flex';
  
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
  
  switchTab('profile');
}

function closeSettings() {
  settingsView.style.display = 'none';
  dashboardView.style.display = 'flex';
}

function switchTab(tabId) {
  activeTab = tabId;
  closeModal('import-modal');
  closeModal('delete-modal');
  tabButtons.forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // Toggle panel visibility
  const panels = settingsContent.querySelectorAll('.tab-pane');
  panels.forEach(p => {
    const isTarget = p.id === `${tabId}-panel`;
    p.style.display = isTarget ? 'block' : 'none';
    p.setAttribute('aria-hidden', isTarget ? 'false' : 'true');
  });
}

function renderTab() {
  // Ensure all panels exist once
  const tabs = ['profile', 'appearance', 'notifications', 'data', 'account'];
  
  if (settingsContent.children.length === 0) {
    tabs.forEach(t => {
      const pane = document.createElement('div');
      pane.className = 'tab-pane';
      pane.setAttribute('role', 'tabpanel');
      pane.setAttribute('id', `${t}-panel`);
      pane.setAttribute('aria-labelledby', `tab-${t}`);
      pane.style.display = 'none';

      switch (t) {
        case 'profile': renderProfileTab(pane); break;
        case 'appearance': renderAppearanceTab(pane); break;
        case 'notifications': renderNotificationsTab(pane); break;
        case 'data': renderDataTab(pane); break;
        case 'account': renderAccountTab(pane); break;
      }
      settingsContent.appendChild(pane);
    });
  }

  switchTab(activeTab);
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

  const displayName = user.displayName || 'Anonymous';
  const email = user.email || '';
  const initialsURL = generateInitialsAvatar(displayName, 80);
  const photoURL = user.photoURL;
  const finalAvatarURL = photoURL || initialsURL;

  container.innerHTML = `
    <div class="settings-section">
      <span class="settings-section-title">Public Profile</span>
      
      <div class="profile-header">
        <div class="profile-avatar-large" id="profile-avatar-display"></div>
        <div class="profile-info">
          <h3 id="profile-display-name-text" style="font-size: 1.5rem; font-weight: 700; margin-bottom: 4px;">${escapeHtml(displayName)}</h3>
          <p style="color: var(--color-text-secondary); font-size: 0.875rem;">${escapeHtml(email)}</p>
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

  // Avatar Rendering
  const avatarUrl = getSafeAvatarUrl(photoURL, displayName, 80);
  const avatarDisp = container.querySelector('#profile-avatar-display');
  if (avatarDisp) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = 'Avatar';
    img.referrerPolicy = 'no-referrer';
    img.style.cssText = 'width: 100%; height: 100%; border-radius: 50%; object-fit: cover;';
    avatarDisp.appendChild(img);
  }

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
      refreshAllAvatars();
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
    .filter(t => t.completed && (t.completedAt || t.createdAt))
    .map(t => {
      const ts = t.completedAt || t.createdAt;
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toDateString();
    });

  if (completedDates.length === 0) {
    // Check backup only if all tasks are empty
    if (allTasks.length === 0) {
      const backup = localStorage.getItem(`streak_${user.uid}`);
      return backup ? parseInt(backup, 10) : 0;
    }
    return 0;
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
            <button id="open-custom-picker-btn" class="color-swatch-plus" title="Add custom color" style="width: 40px; height: 40px; border-radius: 50%; border: 2px dashed var(--color-text-muted); background: transparent; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--color-text-muted); transition: all 0.2s;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
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
      // Sync Top Bar Icon
      window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: val } }));
    });
  });

  // Sync back from Top Bar Toggle
  const syncThemeUI = () => {
    const currentTheme = localStorage.getItem('theme') || 'system';
    themeCards.forEach(c => c.classList.toggle('active', c.dataset.themeVal === currentTheme));
  };
  window.addEventListener('themeChanged', syncThemeUI);
  // Clean up listener when pane is removed
  const observer = new MutationObserver((mutations) => {
    if (!document.body.contains(container)) {
      window.removeEventListener('themeChanged', syncThemeUI);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const swatches = container.querySelectorAll('.color-swatch');
  swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      const val = swatch.dataset.color;
      applyColor(val);
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
  const openPickerBtn = container.querySelector('#open-custom-picker-btn');
  
  let customColors = JSON.parse(localStorage.getItem('customAccentColors') || '[]');
  let editingIndex = -1;

  const renderCustomSwatches = () => {
    customSwatchesRow.innerHTML = '';
    
    customColors
      .filter(isValidHexColor)
      .forEach((color, index) => {
        const swatch = document.createElement('button');
        swatch.className = 'color-swatch custom-swatch' + (currentAccent === color ? ' active' : '');
        swatch.style.backgroundColor = color;
        swatch.dataset.color = color;
        swatch.dataset.index = index;
        swatch.type = 'button';
        
        if (currentAccent === color) {
          swatch.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        }
        
        swatch.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const current = localStorage.getItem('accentColor');
          if (current === color) {
            showContextMenu(swatch, index, color);
          } else {
            applyColor(color);
          }
        });
        
        customSwatchesRow.appendChild(swatch);
      });
  };

  const applyColor = (color) => {
    localStorage.setItem('accentColor', color);
    document.documentElement.style.setProperty('--color-accent', color);
    
    // Select ALL swatches (standard + custom)
    const allSwatches = container.querySelectorAll('.color-swatch');
    allSwatches.forEach(s => {
      const isActive = s.dataset.color === color;
      s.classList.toggle('active', isActive);
      s.innerHTML = isActive ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : '';
    });
    refreshAllAvatars();
  };

  const showContextMenu = (target, index, color) => {
    const existing = document.querySelector('.color-context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'color-context-menu';
    const rect = target.getBoundingClientRect();
    
    menu.style.cssText = `
      position: fixed;
      top: ${rect.top - 80}px;
      left: ${rect.left + rect.width/2 - 60}px;
      width: 120px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
    `;

    menu.innerHTML = `
      <div class="menu-item" id="edit-color" style="height: 36px; padding: 0 12px; display: flex; align-items: center; cursor: pointer; border-radius: 4px; font-size: 0.85rem; font-weight: 600; color: var(--color-text-primary); transition: background 0.2s;">🎨 Edit</div>
      <div class="menu-item" id="remove-color" style="height: 36px; padding: 0 12px; display: flex; align-items: center; cursor: pointer; border-radius: 4px; font-size: 0.85rem; font-weight: 600; color: var(--color-danger); transition: background 0.2s;">🗑️ Remove</div>
    `;

    document.body.appendChild(menu);

    const closeMenu = (e) => {
      if (!menu.contains(e.target) || e.key === 'Escape') {
        menu.remove();
        document.removeEventListener('mousedown', closeMenu);
        document.removeEventListener('keydown', closeMenu);
      }
    };
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeMenu);

    menu.querySelector('#edit-color').addEventListener('click', () => {
      editingIndex = index;
      openColorPicker(color);
      menu.remove();
    });

    menu.querySelector('#remove-color').addEventListener('click', () => {
      const colorToRemove = color;
      target.style.transition = 'opacity 0.2s, transform 0.2s';
      target.style.opacity = '0';
      target.style.transform = 'scale(0.8)';
      setTimeout(() => {
        const idx = customColors.indexOf(colorToRemove);
        if (idx !== -1) {
          customColors.splice(idx, 1);
          localStorage.setItem('customAccentColors', JSON.stringify(customColors));
        }
        if (colorToRemove === localStorage.getItem('accentColor')) {
          applyColor('#2563eb');
        }
        renderCustomSwatches();
      }, 200);
      menu.remove();
    });
  };

  const openColorPicker = (initialColor = '#2563eb') => {
    const existing = document.querySelector('.custom-color-picker-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'custom-color-picker-overlay';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 10001;';
    
    const picker = document.createElement('div');
    const rect = openPickerBtn.getBoundingClientRect();
    picker.style.cssText = `
      position: fixed;
      bottom: ${window.innerHeight - rect.top + 10}px;
      left: ${Math.max(10, Math.min(window.innerWidth - 250, rect.left - 100))}px;
      width: 240px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: 16px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.2);
      transform: scale(0.9);
      opacity: 0;
      transition: all 0.15s ease;
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;

    let currentHex = initialColor;
    let h = 210, s = 80, l = 50;

    const updateFromHex = (hex) => {
      let r = 0, g = 0, b = 0;
      if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
      } else if (hex.length === 7) {
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
      }
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      l = (max + min) / 2;
      if (max === min) { h = s = 0; } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      h *= 360; s *= 100; l *= 100;
    };

    updateFromHex(currentHex);

    picker.innerHTML = `
      <div id="sl-box" style="width: 100%; height: 150px; border-radius: 8px; position: relative; cursor: crosshair; background: linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, transparent);">
        <div id="sl-cursor" style="position: absolute; width: 12px; height: 12px; border: 2px solid #fff; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 0 1px rgba(0,0,0,0.5);"></div>
      </div>
      <div id="hue-slider" style="width: 100%; height: 16px; border-radius: 8px; cursor: pointer; background: linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%); position: relative;">
        <div id="hue-thumb" style="position: absolute; top: -2px; width: 20px; height: 20px; background: #fff; border: 2px solid var(--color-border); border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transform: translateX(-50%);"></div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <div id="preview-circle" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--color-border); background: ${currentHex};"></div>
        <input type="text" id="hex-input" value="${currentHex}" style="flex: 1; height: 36px; padding: 0 8px; background: var(--color-bg); border: 1.5px solid var(--color-border); border-radius: 6px; color: var(--color-text-primary); font-family: monospace; outline: none;">
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
        <button id="picker-cancel" style="padding: 6px 12px; border-radius: 6px; border: none; background: var(--color-btn-secondary); color: var(--color-text-secondary); font-weight: 600; cursor: pointer;">Cancel</button>
        <button id="picker-add" style="padding: 6px 12px; border-radius: 6px; border: none; background: var(--color-accent); color: #fff; font-weight: 600; cursor: pointer;">${editingIndex === -1 ? 'Add' : 'Save'}</button>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.appendChild(picker);
    requestAnimationFrame(() => { picker.style.transform = 'scale(1)'; picker.style.opacity = '1'; });

    const slBox = picker.querySelector('#sl-box');
    const slCursor = picker.querySelector('#sl-cursor');
    const hueSlider = picker.querySelector('#hue-slider');
    const hueThumb = picker.querySelector('#hue-thumb');
    const hexInput = picker.querySelector('#hex-input');
    const preview = picker.querySelector('#preview-circle');

    const updateUI = () => {
      slBox.style.backgroundColor = `hsl(${h}, 100%, 50%)`;
      slCursor.style.left = `${s}%`;
      slCursor.style.top = `${100 - l}%`;
      hueThumb.style.left = `${(h / 360) * 100}%`;
      
      const rgb = hslToRgb(h / 360, s / 100, l / 100);
      currentHex = rgbToHex(rgb[0], rgb[1], rgb[2]);
      hexInput.value = currentHex;
      preview.style.backgroundColor = currentHex;
    };

    const hslToRgb = (h, s, l) => {
      let r, g, b;
      if (s === 0) { r = g = b = l; } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const hue2rgb = (p, q, t) => {
          if (t < 0) t += 1; if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        };
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    };

    const rgbToHex = (r, g, b) => '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');

    const handleSlMove = (e) => {
      const rect = slBox.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      s = x * 100;
      l = 100 - y * 100;
      updateUI();
    };

    const handleHueMove = (e) => {
      const rect = hueSlider.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      h = x * 360;
      updateUI();
    };

    const startDrag = (handler) => (e) => {
      handler(e);
      const move = (me) => handler(me);
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    };

    slBox.addEventListener('mousedown', startDrag(handleSlMove));
    hueSlider.addEventListener('mousedown', startDrag(handleHueMove));

    hexInput.addEventListener('input', (e) => {
      const val = e.target.value;
      if (/^#[0-9A-F]{6}$/i.test(val) || /^#[0-9A-F]{3}$/i.test(val)) {
        updateFromHex(val);
        updateUI();
      }
    });

    const close = () => { overlay.remove(); editingIndex = -1; };
    picker.querySelector('#picker-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, {once: true});

    picker.querySelector('#picker-add').addEventListener('click', () => {
      if (editingIndex !== -1) {
        customColors[editingIndex] = currentHex;
      } else {
        if (!customColors.includes(currentHex)) {
          if (customColors.length >= 5) customColors.shift();
          customColors.push(currentHex);
        }
      }
      localStorage.setItem('customAccentColors', JSON.stringify(customColors));
      applyColor(currentHex);
      renderCustomSwatches();
      close();
    });

    updateUI();
  };

  openPickerBtn.addEventListener('click', () => openColorPicker());

  renderCustomSwatches();
}

// ============================================
//  TAB 3 — NOTIFICATIONS
// ============================================
function renderNotificationsTab(container) {
  const isEnabled = localStorage.getItem('notificationsEnabled') !== 'false'; // Default true
  const defaultTime = localStorage.getItem('defaultReminderTime') || '09:00';
  const soundEnabled = localStorage.getItem('notificationSound') !== 'false'; // Default true
  const leadTime = localStorage.getItem('reminderLeadTime') || 'At the time';
  const permission = (typeof Notification !== 'undefined') ? Notification.permission : 'default';

  const leadTimeOptions = [
    'At the time',
    '5 minutes before',
    '15 minutes before',
    '30 minutes before',
    '1 hour before'
  ];

  container.innerHTML = `
    <div class="settings-section">
      <div class="setting-item master-toggle-row">
        <div class="setting-info">
          <span class="setting-label">Enable Notifications</span>
          <span class="setting-subtitle">Receive reminders for your tasks</span>
        </div>
        <label class="switch">
          <input type="checkbox" id="master-notify-toggle" ${isEnabled ? 'checked' : ''}>
          <span class="slider round"></span>
        </label>
      </div>
    </div>

    <div id="notification-sub-settings" class="${!isEnabled ? 'settings-disabled' : ''}">
      <div class="settings-section">
        <div class="setting-item column">
          <div class="setting-info">
            <span class="setting-label">Default Reminder Time</span>
            <span class="setting-subtitle">Used when no specific time is set</span>
          </div>
          <input type="time" id="default-reminder-time" class="form-input" value="${defaultTime}" style="max-width: 150px; margin-top: 8px;">
        </div>
      </div>

      <div class="settings-section">
        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">Notification Sound</span>
          </div>
          <label class="switch">
            <input type="checkbox" id="notify-sound-toggle" ${soundEnabled ? 'checked' : ''}>
            <span class="slider round"></span>
          </label>
        </div>
      </div>

      <div class="settings-section">
        <div class="setting-item column">
          <div class="setting-info">
            <span class="setting-label">Remind me before</span>
          </div>
          <select id="reminder-lead-time" class="form-input" style="margin-top: 8px;">
            ${leadTimeOptions.map(opt => `<option value="${opt}" ${leadTime === opt ? 'selected' : ''}>${opt}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="settings-section">
        <span class="settings-section-title">Browser Notification Permission</span>
        <div class="permission-status-row" style="display: flex; align-items: center; gap: 12px; margin-top: 8px;">
          <span class="permission-badge ${permission}">
            ${permission === 'granted' ? 'Enabled' : (permission === 'denied' ? 'Blocked' : 'Not set')}
          </span>
          ${permission === 'default' ? `<button id="request-perm-btn" class="primary-btn sm">Enable Notifications</button>` : ''}
        </div>
        
        ${permission === 'denied' ? `
          <div class="permission-warning">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <p>Notifications are blocked. To enable, click the lock icon in your browser's address bar and allow notifications.</p>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  const masterToggle = container.querySelector('#master-notify-toggle');
  const subSettings  = container.querySelector('#notification-sub-settings');
  const defaultTimeInput = container.querySelector('#default-reminder-time');
  const soundToggle = container.querySelector('#notify-sound-toggle');
  const leadTimeSelect = container.querySelector('#reminder-lead-time');
  const requestBtn = container.querySelector('#request-perm-btn');

  masterToggle.addEventListener('change', () => {
    const checked = masterToggle.checked;
    localStorage.setItem('notificationsEnabled', checked);
    subSettings.classList.toggle('settings-disabled', !checked);
  });

  defaultTimeInput.addEventListener('change', () => {
    localStorage.setItem('defaultReminderTime', defaultTimeInput.value);
  });

  soundToggle.addEventListener('change', () => {
    localStorage.setItem('notificationSound', soundToggle.checked);
  });

  leadTimeSelect.addEventListener('change', () => {
    localStorage.setItem('reminderLeadTime', leadTimeSelect.value);
  });

  if (requestBtn) {
    requestBtn.addEventListener('click', async () => {
      try {
        await Notification.requestPermission();
        renderTab(); // Re-render to update badge/button
      } catch (err) {
        console.error("Notification permission error:", err);
      }
    });
  }
}



// ============================================
//  TAB 4 — DATA
// ============================================
function renderDataTab(container) {
  const user = auth.currentUser;
  if (!user) return;

  const completedCount = tasks.filter(t => t.completed).length;
  const totalCount = tasks.length;
  const estimatedSize = (totalCount * 0.5).toFixed(1);

  container.innerHTML = `
    <!-- Storage Usage -->
    <div class="settings-section">
      <div class="storage-card" style="background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 16px; padding: 24px; display: flex; align-items: center; gap: 20px;">
        <div class="storage-icon" style="width: 56px; height: 56px; border-radius: 12px; background: rgba(37, 99, 235, 0.1); display: flex; align-items: center; justify-content: center; font-size: 24px;">📦</div>
        <div style="flex: 1;">
          <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px;">
            <span style="font-size: 1.8rem; font-weight: 800; color: var(--color-accent);">${totalCount}</span>
            <span style="font-size: 0.9rem; font-weight: 600; color: var(--color-text-secondary);">tasks saved</span>
          </div>
          <div style="font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 12px;">~${estimatedSize} KB estimated</div>
          <div style="width: 100%; height: 6px; background: var(--color-bg); border-radius: 10px; overflow: hidden;">
            <div style="width: ${Math.min(100, (totalCount/1000)*100)}%; height: 100%; background: var(--color-accent); border-radius: 10px; transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Export Section -->
    <div class="settings-section">
      <span class="settings-section-title" style="letter-spacing: 0.05em; font-size: 0.75rem; color: var(--color-text-muted);">EXPORT DATA</span>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
        <button id="export-json-btn" class="data-action-btn">
          <span class="btn-content">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export JSON
          </span>
          <div class="spinner hidden"></div>
        </button>
        <button id="export-csv-btn" class="data-action-btn">
          <span class="btn-content">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </span>
          <div class="spinner hidden"></div>
        </button>
      </div>
    </div>

    <!-- Import Section -->
    <div class="settings-section">
      <span class="settings-section-title" style="letter-spacing: 0.05em; font-size: 0.75rem; color: var(--color-text-muted);">IMPORT DATA</span>
      <div style="display: flex; justify-content: center; margin-top: 12px;">
        <button id="import-json-trigger" class="data-action-btn" style="width: 100%;">
          <span class="btn-content">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Import from JSON
          </span>
        </button>
      </div>
      <input type="file" id="import-json-input" accept=".json" style="display: none;">
    </div>

    <!-- Cleanup Section -->
    <div class="settings-section">
      <span class="settings-section-title" style="color: var(--color-danger); letter-spacing: 0.05em; font-size: 0.75rem;">CLEANUP</span>
      <div style="background: rgba(220, 38, 38, 0.05); border: 1px solid rgba(220, 38, 38, 0.2); border-radius: 16px; padding: 20px; margin-top: 12px; display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center;">
        <span style="font-size: 0.9rem; color: var(--color-text-primary); font-weight: 500;">You have <strong style="color: var(--color-danger);">${completedCount}</strong> completed tasks</span>
        <button id="clear-completed-btn" class="data-action-btn danger" ${completedCount === 0 ? 'disabled' : ''} style="width: 100%; max-width: 240px;">
          Clear All Completed
        </button>
      </div>
    </div>

    <style>
      .data-action-btn {
        height: 48px;
        border-radius: 12px;
        border: 1px solid var(--color-accent);
        background: transparent;
        color: var(--color-accent);
        font-weight: 600;
        font-size: 0.9rem;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
      }
      .data-action-btn:hover:not(:disabled) {
        background: var(--color-accent);
        color: white;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
      }
      .data-action-btn:active:not(:disabled) {
        transform: translateY(0);
      }
      .data-action-btn:disabled {
        border-color: var(--color-border);
        color: var(--color-text-muted);
        cursor: not-allowed;
      }
      .data-action-btn.danger {
        border-color: var(--color-danger);
        color: var(--color-danger);
      }
      .data-action-btn.danger:hover:not(:disabled) {
        background: var(--color-danger);
        color: white;
        box-shadow: 0 4px 12px rgba(220, 38, 38, 0.2);
      }
      .btn-content {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .spinner {
        width: 20px;
        height: 20px;
        border: 2px solid currentColor;
        border-top-color: transparent;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .hidden { display: none; }
    </style>
  `;

  // --- Export JSON ---
  const jsonBtn = container.querySelector('#export-json-btn');
  jsonBtn.addEventListener('click', async () => {
    const content = jsonBtn.querySelector('.btn-content');
    const spinner = jsonBtn.querySelector('.spinner');
    
    try {
      content.classList.add('hidden');
      spinner.classList.remove('hidden');
      
      const data = {
        exportVersion: "1.0",
        exportDate: new Date().toISOString(),
        totalTasks: tasks.length,
        tasks: tasks.map(t => ({
          id: t.id,
          title: t.text || t.title || "",
          notes: t.notes || "",
          category: t.category || "other",
          priority: t.priority || "none",
          completed: t.completed || false,
          subtasks: t.subtasks || [],
          recurrence: t.recurrence || "none",
          reminderTime: t.reminderTime || null,
          createdAt: t.createdAt?.toDate ? t.createdAt.toDate().toISOString() : (t.createdAt || null)
        }))
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      downloadFile(blob, `taskflow_export_${new Date().toISOString().split('T')[0]}.json`);
      showToast('JSON Export started', 'success');
    } catch (err) {
      showToast('Export failed', 'error');
    } finally {
      content.classList.remove('hidden');
      spinner.classList.add('hidden');
    }
  });

  // --- Export CSV ---
  const csvBtn = container.querySelector('#export-csv-btn');
  csvBtn.addEventListener('click', async () => {
    const content = csvBtn.querySelector('.btn-content');
    const spinner = csvBtn.querySelector('.spinner');
    
    try {
      content.classList.add('hidden');
      spinner.classList.remove('hidden');
      
      const headers = ['Title', 'Category', 'Priority', 'Completed', 'ReminderTime', 'Recurrence', 'Notes', 'CreatedAt'];
      
      const escapeCSV = (val) => {
        if (val === null || val === undefined) return '""';
        const str = String(val);
        return `"${str.replace(/"/g, '""')}"`;
      };

      const rows = tasks.map(t => [
        escapeCSV(t.text || t.title || ''),
        escapeCSV(t.category || 'other'),
        escapeCSV(t.priority || 'none'),
        escapeCSV(t.completed || false),
        escapeCSV(t.reminderTime || ''),
        escapeCSV(t.recurrence || 'none'),
        escapeCSV(t.notes || ''),
        escapeCSV(t.createdAt?.toDate ? t.createdAt.toDate().toISOString() : (t.createdAt || ''))
      ]);
      
      const csvString = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
      const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
      downloadFile(blob, `taskflow_export_${new Date().toISOString().split('T')[0]}.csv`);
      showToast('CSV Export started', 'success');
    } catch (err) {
      showToast('Export failed', 'error');
    } finally {
      content.classList.remove('hidden');
      spinner.classList.add('hidden');
    }
  });

  // --- Import JSON ---
  const importInput = container.querySelector('#import-json-input');
  container.querySelector('#import-json-trigger').addEventListener('click', () => importInput.click());

  importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = JSON.parse(event.target.result);
        let imported = [];
        
        if (Array.isArray(raw)) {
          imported = raw;
        } else if (raw && Array.isArray(raw.tasks)) {
          imported = raw.tasks;
        } else {
          throw new Error('Invalid structure');
        }

        if (imported.length === 0) {
          showToast('No tasks found in file', 'info');
          return;
        }

        showImportModal(imported);
      } catch (err) {
        showToast('Invalid JSON file', 'error');
      }
    };
    reader.readAsText(file);
    importInput.value = ''; 
  });

  // --- Clear Completed ---
  container.querySelector('#clear-completed-btn').addEventListener('click', () => {
    if (completedCount === 0) return;
    
    showDeleteModal(completedCount, async () => {
      try {
        const user = auth.currentUser;
        const completedTasks = tasks.filter(t => t.completed);
        for (let i = 0; i < completedTasks.length; i += 500) {
          const batch = writeBatch(db);
          const chunk = completedTasks.slice(i, i + 500);
          chunk.forEach(t => {
            batch.delete(doc(db, 'users', user.uid, 'tasks', t.id));
          });
          await batch.commit();
        }
        showToast('Tasks cleared', 'success');
      } catch (err) {
        showToast('Failed to clear tasks', 'error');
      }
    });
  });
}

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function showDeleteModal(count, onConfirm) {
  let modal = document.getElementById('delete-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.className = 'tf-modal-overlay';
  modal.id = 'delete-modal';
  modal.innerHTML = `
    <div class="tf-modal-card">
      <div class="tf-modal-header">
        <h3 class="tf-modal-title">Delete Tasks</h3>
        <button class="tf-modal-close">✕</button>
      </div>
      <div class="tf-modal-body">
        This will permanently remove <strong>${count}</strong> completed tasks. This action cannot be undone.
      </div>
      <div class="tf-modal-footer">
        <button class="tf-btn-secondary">Cancel</button>
        <button class="tf-btn-danger">Delete All</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.tf-modal-close').onclick = () => closeModal('delete-modal');
  modal.querySelector('.tf-btn-secondary').onclick = () => closeModal('delete-modal');
  modal.querySelector('.tf-btn-danger').onclick = () => {
    onConfirm();
    closeModal('delete-modal');
  };
  modal.onclick = (e) => { if (e.target === modal) closeModal('delete-modal'); };
  
  setTimeout(() => openModal('delete-modal'), 10);
}

function showImportModal(importedTasks) {
  let modal = document.getElementById('import-modal');
  if (modal) modal.remove();

  const previewList = importedTasks.slice(0, 3).map(t => {
    const title = t.title || t.text || 'Untitled Task';
    return `<li>• ${escapeHtml(title)}</li>`;
  }).join('');

  modal = document.createElement('div');
  modal.className = 'tf-modal-overlay';
  modal.id = 'import-modal';
  modal.innerHTML = `
    <div class="tf-modal-card">
      <div class="tf-modal-header">
        <h3 class="tf-modal-title">Import Tasks</h3>
        <button class="tf-modal-close">✕</button>
      </div>
      <div class="tf-modal-body">
        Found <strong>${importedTasks.length}</strong> tasks to import.
        <ul class="tf-modal-task-list">
          ${previewList}
        </ul>
        ${importedTasks.length > 3 ? `<div class="tf-modal-more">...and ${importedTasks.length - 3} more tasks</div>` : ''}
      </div>
      <div class="tf-modal-footer">
        <button class="tf-btn-secondary">Cancel</button>
        <button class="tf-btn-primary">Import All</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.tf-modal-close').onclick = () => closeModal('import-modal');
  modal.querySelector('.tf-btn-secondary').onclick = () => closeModal('import-modal');
  modal.onclick = (e) => { if (e.target === modal) closeModal('import-modal'); };

  modal.querySelector('.tf-btn-primary').onclick = async () => {
    const user = auth.currentUser;
    if (!user) return;
    
    const btn = modal.querySelector('.tf-btn-primary');
    btn.disabled = true;
    btn.textContent = 'Importing...';

    try {
      const now = Date.now();
      for (let i = 0; i < importedTasks.length; i += 500) {
        const batch = writeBatch(db);
        const chunk = importedTasks.slice(i, i + 500);
        
        chunk.forEach((t, idx) => {
          const newRef = doc(collection(db, 'users', user.uid, 'tasks'));
          const clean = {
            text: sanitize(t.title || t.text || 'Imported Task'),
            category: t.category || 'other',
            priority: t.priority || 'none',
            notes: sanitize(t.notes || ''),
            recurrence: t.recurrence || 'none',
            completed: false,
            notificationId: null,
            reminderTime: null,
            createdAt: serverTimestamp(),
            order: now + i + idx
          };
          if (t.subtasks && Array.isArray(t.subtasks)) {
            clean.subtasks = t.subtasks.map(st => ({
              ...st,
              text: sanitize(st.text || st.content || '')
            }));
          }
          batch.set(newRef, clean);
        });
        await batch.commit();
      }
      showToast(`${importedTasks.length} tasks imported`, 'success');
      closeModal('import-modal');
    } catch (err) {
      showToast('Import failed', 'error');
      btn.disabled = false;
      btn.textContent = 'Import All';
    }
  };
  
  setTimeout(() => openModal('import-modal'), 10);
}


// ============================================
//  TAB 5 — ACCOUNT (REDESIGN)
// ============================================
function renderAccountTab(container) {
  const user = auth.currentUser;
  if (!user) return;

  const isGoogle = user.providerData.some(p => p.providerId === 'google.com');
  const creationDate = user.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Unknown';

  container.innerHTML = `
    <!-- Section 1 — Account Info Card -->
    <div class="settings-section">
      <div class="account-premium-card" style="position: relative; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 16px; padding: 16px; display: flex; align-items: center; gap: 16px; overflow: hidden;">
        <!-- Auth Badge (Top Right) -->
        <div style="position: absolute; top: 12px; right: 12px;">
          ${isGoogle 
            ? `<div class="auth-pill google" style="background: #4285F4; color: white; padding: 4px 10px; border-radius: 100px; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(66, 133, 244, 0.2);">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Google
              </div>`
            : `<div class="auth-pill email" style="background: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text-muted); padding: 4px 10px; border-radius: 100px; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 6px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                Email
              </div>`
          }
        </div>

        <div class="user-avatar-container" id="account-avatar-container" style="flex-shrink: 0; width: 48px; height: 48px; border-radius: 50%; background: var(--color-accent); color: white; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700;">
          <!-- Content populated via safe DOM APIs -->
        </div>

        <div class="user-details" style="display: flex; flex-direction: column; gap: 1px; padding-right: 60px;">
          <span id="account-display-name" style="font-size: 18px; font-weight: 700; color: var(--color-text-primary); line-height: 1.2;"></span>
          <span id="account-email" style="font-size: 14px; color: var(--color-text-muted);"></span>
          <span id="account-member-since" style="font-size: 12px; color: var(--color-text-muted); opacity: 0.8;"></span>
        </div>
      </div>
    </div>

    <!-- Section 2 — Security Card -->
    <div class="settings-section">
      <span class="settings-section-title" style="letter-spacing: 0.08em; font-size: 11px; font-weight: 700; color: var(--color-text-muted);">SECURITY</span>
      <div class="security-card" style="background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 16px; padding: 16px; margin-top: 10px;">
        ${isGoogle 
          ? `<div style="background: rgba(66, 133, 244, 0.05); border-left: 4px solid #4285F4; border-radius: 8px; padding: 14px; display: flex; gap: 12px; align-items: flex-start;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4285F4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; margin-top: 2px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              <div style="font-size: 14px; color: var(--color-text-secondary); line-height: 1.5;">
                <div style="font-weight: 700; color: var(--color-text-primary); margin-bottom: 2px;">Password managed by Google</div>
                Your account is protected by Google. <a href="https://myaccount.google.com" target="_blank" style="color: #4285F4; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">Manage at myaccount.google.com <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></a>
              </div>
            </div>`
          : `<div id="password-form" style="display: flex; flex-direction: column; gap: 16px;">
              <div class="input-field">
                <label style="font-size: 12px; font-weight: 600; color: var(--color-text-muted); margin-bottom: 6px; display: block;">Current Password</label>
                <div style="position: relative;">
                  <input type="password" id="cur-pw" class="premium-input" placeholder="••••••••" style="height: 48px;">
                  <button type="button" class="pw-eye" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--color-text-muted); cursor: pointer; display: flex;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                </div>
              </div>
              <div class="input-field">
                <label style="font-size: 12px; font-weight: 600; color: var(--color-text-muted); margin-bottom: 6px; display: block;">New Password</label>
                <div style="position: relative;">
                  <input type="password" id="new-pw" class="premium-input" placeholder="Min. 8 characters" style="height: 48px;">
                  <button type="button" class="pw-eye" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--color-text-muted); cursor: pointer; display: flex;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                </div>
                <div id="new-pw-error" style="color: #ef4444; font-size: 11px; margin-top: 4px; display: none;">Password must be at least 8 characters</div>
              </div>
              <div class="input-field">
                <label style="font-size: 12px; font-weight: 600; color: var(--color-text-muted); margin-bottom: 6px; display: block;">Confirm New Password</label>
                <div style="position: relative;">
                  <input type="password" id="conf-pw" class="premium-input" placeholder="••••••••" style="height: 48px;">
                  <button type="button" class="pw-eye" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--color-text-muted); cursor: pointer; display: flex;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                </div>
                <div id="conf-pw-error" style="color: #ef4444; font-size: 11px; margin-top: 4px; display: none;">Passwords do not match</div>
              </div>
              <button id="update-pw-action" class="tf-btn-primary" style="height: 48px; border-radius: 12px; font-weight: 700; letter-spacing: 0.02em; margin-top: 4px;" disabled>Update Password</button>
            </div>`
        }
      </div>
    </div>

    <!-- Section 3 — Danger Zone Card -->
    <div class="settings-section">
      <span class="settings-section-title" style="color: #ef4444; letter-spacing: 0.08em; font-size: 11px; font-weight: 700;">DANGER ZONE</span>
      <div class="danger-premium-card" style="background: rgba(239, 68, 68, 0.03); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 16px; padding: 20px; margin-top: 10px;">
        <!-- Sign Out Row -->
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(0,0,0,0.05); display: flex; align-items: center; justify-content: center; color: var(--color-text-secondary);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </div>
            <div>
              <div style="font-weight: 700; font-size: 16px; color: var(--color-text-primary);">Sign Out</div>
              <div style="font-size: 13px; color: var(--color-text-muted);">Sign out of your account</div>
            </div>
          </div>
          <button id="action-signout" class="tf-btn-secondary" style="height: 36px; padding: 0 16px; font-size: 14px; font-weight: 600; border-radius: 8px;">Sign Out</button>
        </div>

        <div style="height: 1px; background: rgba(239, 68, 68, 0.1); margin: 16px 0;"></div>

        <!-- Delete Account Row -->
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(239, 68, 68, 0.1); display: flex; align-items: center; justify-content: center; color: #ef4444;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </div>
            <div>
              <div style="font-weight: 700; font-size: 16px; color: #ef4444;">Delete Account</div>
              <div style="font-size: 13px; color: var(--color-text-muted);">Permanently delete all your data</div>
            </div>
          </div>
          <button id="action-delete" class="tf-btn-danger-outline" style="height: 36px; padding: 0 16px; font-size: 14px; font-weight: 600; border-radius: 8px; border: 1px solid #ef4444; color: #ef4444; background: transparent; transition: all 0.2s;">Delete</button>
        </div>
      </div>
    </div>

    <style>
      .premium-input {
        width: 100%;
        padding: 0 16px;
        border-radius: 10px;
        border: 1px solid var(--color-border);
        background: var(--color-bg);
        color: var(--color-text-primary);
        font-size: 15px;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .premium-input:focus {
        border-color: var(--color-accent);
        outline: none;
        box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.08);
      }
      .tf-btn-danger-outline:hover {
        background: #ef4444 !important;
        color: white !important;
      }
      @media (max-width: 480px) {
        .account-premium-card { padding: 12px; }
        .danger-premium-card { padding: 16px; }
      }
    </style>
  `;

  // --- Populate Account Details Safely ---
  const avatarContainer = container.querySelector('#account-avatar-container');
  const displayNameEl = container.querySelector('#account-display-name');
  const emailEl = container.querySelector('#account-email');
  const memberSinceEl = container.querySelector('#account-member-since');

  if (user.photoURL) {
    const img = document.createElement('img');
    img.src = user.photoURL;
    img.style.cssText = 'width: 100%; height: 100%; border-radius: 50%; object-fit: cover;';
    avatarContainer.innerHTML = '';
    avatarContainer.appendChild(img);
  } else {
    const initials = user.displayName 
      ? user.displayName.trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
      : '?';
    avatarContainer.textContent = initials;
  }

  displayNameEl.textContent = user.displayName || 'TaskFlow User';
  emailEl.textContent = user.email || '';
  memberSinceEl.textContent = `Member since ${creationDate}`;

  // --- Password Functionality ---
  if (!isGoogle) {
    const curInput = container.querySelector('#cur-pw');
    const newInput = container.querySelector('#new-pw');
    const confInput = container.querySelector('#conf-pw');
    const newErr = container.querySelector('#new-pw-error');
    const confErr = container.querySelector('#conf-pw-error');
    const updateBtn = container.querySelector('#update-pw-action');

    const validate = () => {
      const v1 = newInput.value;
      const v2 = confInput.value;
      const cur = curInput.value;

      let valid = true;
      if (v1 && v1.length < 8) { newErr.style.display = 'block'; valid = false; } else { newErr.style.display = 'none'; }
      if (v2 && v1 !== v2) { confErr.style.display = 'block'; valid = false; } else { confErr.style.display = 'none'; }
      
      updateBtn.disabled = !cur || !v1 || !v2 || v1.length < 8 || v1 !== v2;
    };

    [curInput, newInput, confInput].forEach(inp => inp.addEventListener('input', validate));

    container.querySelectorAll('.pw-eye').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = btn.previousElementSibling;
        const type = inp.type === 'password' ? 'text' : 'password';
        inp.type = type;
        btn.innerHTML = type === 'password' 
          ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
          : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
      });
    });

    updateBtn.onclick = async () => {
      updateBtn.disabled = true;
      updateBtn.innerHTML = `<div class="loader-spinner" style="width: 20px; height: 20px; border-width: 3px;"></div>`;
      try {
        const cred = EmailAuthProvider.credential(user.email, curInput.value);
        await reauthenticateWithCredential(user, cred);
        await updatePassword(user, newInput.value);
        showToast('Password updated successfully', 'success');
        curInput.value = newInput.value = confInput.value = '';
        validate();
      } catch (err) {
        let msg = 'Failed to update password';
        if (err.code === 'auth/wrong-password') msg = 'Incorrect password';
        if (err.code === 'auth/requires-recent-login') msg = 'Please verify your identity first';
        if (err.code === 'auth/too-many-requests') msg = 'Too many attempts. Try again later.';
        showToast(msg, 'error');
      } finally {
        updateBtn.innerHTML = 'Update Password';
        validate();
      }
    };
  }

  // --- Sign Out ---
  const signoutBtn = container.querySelector('#action-signout');
  signoutBtn.onclick = async () => {
    signoutBtn.disabled = true;
    signoutBtn.textContent = 'Signing out...';
    try {
      await signOut(auth);
      const theme = localStorage.getItem('theme');
      localStorage.clear();
      if (theme) localStorage.setItem('theme', theme);
      window.location.reload();
    } catch (err) {
      showToast('Sign out failed', 'error');
      signoutBtn.disabled = false;
      signoutBtn.textContent = 'Sign Out';
    }
  };

  // --- Delete Account ---
  container.querySelector('#action-delete').onclick = () => {
    showDeleteAccountModal();
  };
}

function showDeleteAccountModal() {
  const user = auth.currentUser;
  if (!user) return;

  let modal = document.createElement('div');
  modal.className = 'tf-modal-overlay';
  modal.id = 'delete-account-modal';
  modal.innerHTML = `
    <div class="tf-modal-card">
      <div class="tf-modal-header">
        <h3 class="tf-modal-title">Delete Account</h3>
        <button class="tf-modal-close">✕</button>
      </div>
      <div class="tf-modal-body" style="text-align: center; padding: 32px 24px;">
        <div style="color: #ef4444; margin-bottom: 20px; animation: pulse 2s infinite;">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <div style="color: #ef4444; font-weight: 700; font-size: 18px; margin-bottom: 8px;">This action cannot be undone</div>
        <p style="color: var(--color-text-secondary); font-size: 14px; line-height: 1.6; margin-bottom: 12px;">All your tasks (${tasks.length}) and account data will be permanently deleted from our servers.</p>
        
        <div style="margin-top: 24px; text-align: left;">
          <label style="font-size: 12px; font-weight: 700; color: var(--color-text-muted); display: block; margin-bottom: 8px; text-transform: uppercase;">Type "DELETE" to confirm</label>
          <input type="text" id="delete-confirm-inp" class="premium-input" placeholder="Type DELETE here" style="height: 48px; border-color: rgba(239, 68, 68, 0.3);">
        </div>
      </div>
      <div class="tf-modal-footer">
        <button class="tf-btn-secondary" id="delete-cancel-btn" style="flex: 1;">Cancel</button>
        <button id="delete-confirm-btn" class="tf-btn-danger" style="flex: 1; height: 44px;" disabled>Delete Account</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const inp = modal.querySelector('#delete-confirm-inp');
  const btn = modal.querySelector('#delete-confirm-btn');
  const cancel = modal.querySelector('#delete-cancel-btn');
  const closeBtn = modal.querySelector('.tf-modal-close');

  inp.addEventListener('input', () => { btn.disabled = inp.value !== 'DELETE'; });

  const close = () => {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 200);
  };

  cancel.onclick = closeBtn.onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };

  btn.onclick = async () => {
    btn.disabled = true;
    btn.innerHTML = `<div class="loader-spinner" style="width: 18px; height: 18px; border-width: 2px;"></div>`;
    
    try {
      // 1. First, check if we need re-authentication before deleting data
      // We do a dummy update to trigger potential auth errors early
      try {
        await updateDoc(doc(db, 'users', user.uid), { lastDeletionAttempt: serverTimestamp() });
      } catch (err) {
        if (err.code === 'permission-denied' || err.code === 'auth/requires-recent-login') {
          throw err;
        }
      }

      // 2. Mark deletion in progress
      await updateDoc(doc(db, 'users', user.uid), { deletionInProgress: true });

      // 3. Cleanup Firestore data
      const userRef = doc(db, 'users', user.uid);
      
      // Batch delete tasks (500 per batch is Firestore limit)
      for (let i = 0; i < tasks.length; i += 500) {
        const batch = writeBatch(db);
        tasks.slice(i, i + 500).forEach(t => {
          batch.delete(doc(db, 'users', user.uid, 'tasks', t.id));
        });
        await batch.commit();
      }

      // Delete user doc
      await deleteDoc(userRef);

      // 4. Delete Auth Account
      await user.delete();

      // 5. Final Cleanup
      localStorage.clear();
      window.location.reload();
    } catch (err) {
      if (err.code === 'auth/requires-recent-login' || err.message?.includes('recent login')) {
        close();
        showReauthModal();
      } else {
        console.error("Critical Deletion Failure:", err);
        showToast('Failed to delete account. Please re-authenticate and try again.', 'error');
        btn.disabled = false;
        btn.innerHTML = 'Delete Account';
      }
    }
  };

  setTimeout(() => modal.classList.add('active'), 10);
}

function showReauthModal() {
  const user = auth.currentUser;
  const isGoogle = user.providerData.some(p => p.providerId === 'google.com');

  let modal = document.createElement('div');
  modal.className = 'tf-modal-overlay';
  modal.id = 'reauth-modal';
  modal.innerHTML = `
    <div class="tf-modal-card">
      <div class="tf-modal-header">
        <h3 class="tf-modal-title">Verify Your Identity</h3>
        <button class="tf-modal-close">✕</button>
      </div>
      <div class="tf-modal-body" style="padding: 24px;">
        <p style="color: var(--color-text-secondary); line-height: 1.6; margin-bottom: 24px;">For security, please sign in again before deleting your account.</p>
        
        ${isGoogle 
          ? `<button id="reauth-google-btn" class="tf-btn-primary" style="width: 100%; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 10px; background: #4285F4; border: none;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Re-authenticate with Google
            </button>`
          : `<div style="display: flex; flex-direction: column; gap: 12px;">
              <input type="password" id="reauth-password" placeholder="Confirm your password" style="width: 100%; height: 48px; padding: 0 16px; border-radius: 12px; border: 1px solid var(--color-border); background: var(--color-bg); color: var(--color-text-primary); outline: none;">
              <button id="reauth-email-btn" class="tf-btn-primary" style="width: 100%; height: 48px; border-radius: 12px;">Verify and Proceed</button>
            </div>`
        }
      </div>
      <div class="tf-modal-footer">
        <button class="tf-btn-secondary" id="reauth-cancel-btn" style="width: 100%;">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 200);
  };

  modal.querySelector('#reauth-cancel-btn').onclick = close;
  modal.querySelector('.tf-modal-close').onclick = close;

  const googleBtn = modal.querySelector('#reauth-google-btn');
  if (googleBtn) {
    googleBtn.onclick = async () => {
      googleBtn.disabled = true;
      try {
        await reauthenticateWithPopup(user, googleProvider);
        showToast('Identity verified. You can now delete your account.', 'success');
        close();
        showDeleteAccountModal();
      } catch (err) {
        console.error("Re-auth failed:", err);
        showToast('Verification failed', 'error');
        googleBtn.disabled = false;
      }
    };
  }

  const emailBtn = modal.querySelector('#reauth-email-btn');
  const passwordInput = modal.querySelector('#reauth-password');
  if (emailBtn && passwordInput) {
    emailBtn.onclick = async () => {
      const password = passwordInput.value;
      if (!password) return showToast('Please enter password', 'error');
      
      emailBtn.disabled = true;
      try {
        const cred = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, cred);
        showToast('Identity verified. You can now delete your account.', 'success');
        close();
        showDeleteAccountModal();
      } catch (err) {
        showToast('Incorrect password', 'error');
        emailBtn.disabled = false;
      }
    };
  }

  setTimeout(() => modal.classList.add('active'), 10);
}

