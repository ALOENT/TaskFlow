// ============================================
//  TaskFlow — Service Worker for Web Notifications
//
//  This service worker enables notifications to appear
//  even when the browser tab is minimized (but not closed).
//
//  LIMITATION: If the browser is fully closed, this worker
//  is terminated by the OS and notifications won't fire.
//  For reliable background notifications, use the native app.
// ============================================

// Listen for messages from the main app
self.addEventListener('message', (event) => {
  // Validate sender
  if (event.origin !== self.location.origin) return;

  if (
    event.data &&
    event.data.type === 'SHOW_NOTIFICATION' &&
    typeof event.data.title === 'string' &&
    typeof event.data.body === 'string' &&
    event.data.taskId
  ) {
    self.registration.showNotification(event.data.title, {
      body: event.data.body,
      icon: '/favicon.ico',
      tag: `task-${event.data.taskId}`,
      data: { taskId: event.data.taskId }
    }).catch(err => {
      console.error(`Error showing notification for task ${event.data.taskId}:`, err);
    });
  }
});

// Handle notification click — focus or open the app tab
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Try to focus an existing tab, or open a new one
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If the app is already open in a tab, focus it
        for (const client of clientList) {
          let isSameOrigin = false;
          try {
            isSameOrigin = new URL(client.url).origin === self.location.origin;
          } catch (e) {}

          if (isSameOrigin && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise, open a new tab
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
      .catch((err) => {
        console.error('Error handling notification click:', err);
      })
  );
});
