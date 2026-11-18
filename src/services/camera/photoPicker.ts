import * as ImagePicker from 'expo-image-picker';

import { requestCamera, type PermissionOutcome } from '../permissions/permissions';

export type PickOutcome = { kind: 'picked'; uri: string } | { kind: 'cancelled' } | { kind: 'permission'; outcome: Exclude<PermissionOutcome, 'granted'> } | { kind: 'error'; message: string };

const OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, allowsEditing: false, exif: false };

/** Camera capture — camera permission is requested here, at the moment of use. */
export async function takePhoto(): Promise<PickOutcome> {
  const perm = await requestCamera();
  if (perm !== 'granted') return { kind: 'permission', outcome: perm };
  try {
    const r = await ImagePicker.launchCameraAsync(OPTIONS);
    return r.canceled || !r.assets[0] ? { kind: 'cancelled' } : { kind: 'picked', uri: r.assets[0].uri };
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

/** Gallery selection via the Android Photo Picker — no storage permission requested. */
export async function pickFromGallery(): Promise<PickOutcome> {
  try {
    const r = await ImagePicker.launchImageLibraryAsync({ ...OPTIONS, selectionLimit: 1 });
    return r.canceled || !r.assets[0] ? { kind: 'cancelled' } : { kind: 'picked', uri: r.assets[0].uri };
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
