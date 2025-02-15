
import { urlBase64ToUint8Array } from '../lib/utils';

export function usePushNotifications() {
  const subscribe = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY)
      });
      
      await fetch('/api/subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription)
      });

      return true;
    } catch (err) {
      console.error('Error subscribing to push notifications:', err);
      return false;
    }
  };

  return { subscribe };
}
