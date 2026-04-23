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
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(event.data.title, {
      body: event.data.body,
      icon: '/favicon.ico',
      tag: `task-${event.data.taskId}`,
      data: { taskId: event.data.taskId }
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
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise, open a new tab
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});
