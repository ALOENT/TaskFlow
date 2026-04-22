// ============================================
//  TaskFlow — Notification Scheduling (Platform-Aware)
//
//  This module handles task reminder notifications.
//  On native platforms (Android/iOS via Capacitor):
//    → Uses @capacitor/local-notifications for real OS-level alerts
//  On web (browser):
//    → Uses the Web Notifications API + setTimeout for timed alerts
//    → Falls back gracefully if permissions are denied
//
//  BROWSER LIMITATION: If the tab is fully closed (not just minimized),
//  web notifications scheduled via setTimeout will NOT fire.
//  This is inherent to how browsers work — not a bug.
//  For reliable background notifications, use the native mobile app.
// ============================================

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// ============================================
//  In-memory store for web setTimeout IDs
//  Maps taskId → timeoutId so we can cancel timers
// ============================================
const webTimerMap = new Map();

// ============================================
//  PLATFORM DETECTION
//  Returns true when running inside the Capacitor native shell
// ============================================
function isNative() {
  return Capacitor.isNativePlatform();
}

// ============================================
//  SCHEDULE A TASK REMINDER
//
//  Takes a task object with { id, title, reminderTime }
//  Returns a numeric notificationId (to save in Firestore)
//
//  On native: schedules a real OS notification via Capacitor
//  On web: uses setTimeout + Web Notifications API
// ============================================
export async function scheduleTaskReminder(task) {
  if (!task.reminderTime) return null;

  const reminderDate = new Date(task.reminderTime);
  const msUntil = reminderDate.getTime() - Date.now();

  // Don't schedule notifications for past times
  if (msUntil <= 0) return null;

  // Generate a unique numeric notification ID
  const notificationId = Date.now() % 100000;

  if (isNative()) {
    // ── NATIVE (Capacitor) ──
    try {
      // Request permission first (no-op if already granted)
      const permResult = await LocalNotifications.requestPermissions();
      if (permResult.display !== 'granted') {
        console.warn('Notification permission denied');
        return null;
      }

      await LocalNotifications.schedule({
        notifications: [{
          id: notificationId,
          title: 'TaskFlow Reminder 🔔',
          body: `Time to: ${task.title}`,
          schedule: { at: reminderDate },
          sound: 'default',
          actionTypeId: '',
          extra: { taskId: task.id }
        }]
      });
    } catch (err) {
      console.error('Error scheduling native notification:', err);
      return null;
    }
  } else {
    // ── WEB (Browser) ──
    try {
      // Request browser notification permission
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }

      if (Notification.permission !== 'granted') {
        console.warn('Web notification permission denied');
        return null;
      }

      // Schedule the notification using setTimeout
      const timeoutId = setTimeout(() => {
        // Try service worker notification first (works when tab is minimized)
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            title: 'TaskFlow Reminder 🔔',
            body: `Time to: ${task.title}`,
            taskId: task.id
          });
        } else {
          // Direct notification (only works when tab is focused/visible)
          new Notification('TaskFlow Reminder 🔔', {
            body: `Time to: ${task.title}`,
            icon: '/favicon.ico',
            tag: `task-${task.id}`
          });
        }
        // Clean up the timer reference
        webTimerMap.delete(task.id);
      }, msUntil);

      // Store the timeout ID so we can cancel it later
      webTimerMap.set(task.id, timeoutId);
    } catch (err) {
      console.error('Error scheduling web notification:', err);
      return null;
    }
  }

  return notificationId;
}

// ============================================
//  CANCEL A TASK REMINDER
//
//  Takes the notificationId (from Firestore) and the taskId
//  On native: cancels the Capacitor local notification
//  On web: clears the setTimeout timer
// ============================================
export async function cancelTaskReminder(notificationId, taskId) {
  if (isNative()) {
    // ── NATIVE ──
    if (notificationId != null) {
      try {
        await LocalNotifications.cancel({
          notifications: [{ id: notificationId }]
        });
      } catch (err) {
        console.error('Error cancelling native notification:', err);
      }
    }
  } else {
    // ── WEB ──
    if (taskId && webTimerMap.has(taskId)) {
      clearTimeout(webTimerMap.get(taskId));
      webTimerMap.delete(taskId);
    }
  }
}

// ============================================
//  RESCHEDULE ALL REMINDERS (on app startup)
//
//  Takes the full tasks array from Firestore.
//  Filters for tasks that:
//    - Have a reminderTime set
//    - reminderTime is in the future
//    - Task is not completed
//  Schedules each one and returns a Map of taskId → notificationId
//
//  This is critical after phone restart or browser reload,
//  because all in-memory timers / native notifications are lost.
// ============================================
export async function rescheduleAllReminders(tasks) {
  const results = new Map();

  const pending = tasks.filter(t =>
    t.reminderTime &&
    !t.completed &&
    new Date(t.reminderTime).getTime() > Date.now()
  );

  for (const task of pending) {
    const notificationId = await scheduleTaskReminder(task);
    if (notificationId != null) {
      results.set(task.id, notificationId);
    }
  }

  return results;
}

// ============================================
//  REGISTER SERVICE WORKER (web only)
//
//  Registers sw.js for background web notifications.
//  Called once on app startup when running in browser.
// ============================================
export async function registerServiceWorker() {
  if (!isNative() && 'serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
      console.log('Service worker registered for web notifications');
    } catch (err) {
      console.warn('Service worker registration failed:', err);
    }
  }
}
