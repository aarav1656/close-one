/**
 * Posts a system toast from a headless service. The documented API is the React
 * hook useToastKepler, which a service has no React tree to call. This builds the
 * same NotificationContent the hook builds and hands it to the same TurboModule.
 * The channel name must equal a render template or the post succeeds and nothing
 * is drawn (first found by github.com/rogerjeasy/wick, FRICTION FL-022).
 */
import type {
  Importance,
  NotificationContent,
} from '@amazon-devices/react-native-kepler/Libraries/Components/ToastKepler/NativeNotificationManager';
import {
  AppLaunchTarget,
  ToastKind,
} from '@amazon-devices/react-native-kepler/Libraries/Components/ToastKepler/NotificationManagerUtils';
import {APP_URI} from '../config';

export const MENU_TOAST = 'MenuToastRenderTemplate';
export const TOAST_SECONDS = 8;
const NORMAL = 'NORMAL' as Importance;

export function cueToast(
  title: string,
  description: string,
  channelName: string = MENU_TOAST,
): NotificationContent {
  return {
    mTitle: title,
    mDescription: description,
    mIconUri: 'https://www.amazon.com/favicon.ico',
    mTimeout: TOAST_SECONDS,
    mLaunchTargets: [new AppLaunchTarget(APP_URI, 'Open Clutch', 'not_used')],
    mChannel: {
      importance: {importance: NORMAL},
      kind: new ToastKind(),
      name: channelName,
    },
  };
}

export async function postToast(content: NotificationContent): Promise<unknown> {
  // Lazy: the module looks its TurboModule up at import, which throws outside a Vega runtime.
  const manager = (
    await import(
      '@amazon-devices/react-native-kepler/Libraries/Components/ToastKepler/NativeNotificationManager'
    )
  ).default;
  return manager.post(content);
}
