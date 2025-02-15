import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Convert base64 string to Uint8Array for web push
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  // Remove any padding characters from the base64 string
  const base64 = base64String.replace(/=+$/, '');

  // Replace URL-safe characters back to standard base64 characters
  const rawData = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));

  // Convert raw string to Uint8Array
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}