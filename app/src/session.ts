import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';
import {DEFAULT_SERVER_URL, normalizeServerUrl} from './config';

// The app and the cue service run in separate processes of one package and share this storage:
// the app pairs and stores the token, the service reads it each time it connects.
const SERVER_KEY = 'clutch.server';
const TOKEN_KEY = 'clutch.token';

export async function getServerUrl(): Promise<string> {
  const stored = await AsyncStorage.getItem(SERVER_KEY);
  return (stored && normalizeServerUrl(stored)) || DEFAULT_SERVER_URL;
}

/** Returns false when the address is not an http(s) host. A new server means a new household, so the old token goes. */
export async function setServerUrl(input: string): Promise<boolean> {
  const url = normalizeServerUrl(input);
  if (!url) {
    return false;
  }
  if (url !== (await getServerUrl())) {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
  await AsyncStorage.setItem(SERVER_KEY, url);
  return true;
}

export async function resetServerUrl(): Promise<void> {
  await AsyncStorage.removeItem(SERVER_KEY);
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export const getToken = (): Promise<string | null> => AsyncStorage.getItem(TOKEN_KEY);
export const saveToken = (token: string): Promise<void> => AsyncStorage.setItem(TOKEN_KEY, token);
export const clearToken = (): Promise<void> => AsyncStorage.removeItem(TOKEN_KEY);
