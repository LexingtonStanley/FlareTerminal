import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';

import { fromBase64 } from '@/features/ssh/bytes';

/** Where an image to send comes from. */
export type ImageSource = 'clipboard' | 'library' | 'camera';

/** Thrown when the source has nothing to give, with what to tell the person. */
export class NoImage extends Error {}

// The picker's base64 is a fresh JPEG of the pixels on both platforms, whatever the photo's
// format: never HEIC, which agents can't read, and none of the photo's metadata (where it was
// taken). 80% keeps it a size an agent reads quickly.
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: 'images',
  base64: true,
  quality: 0.8,
  exif: false,
};

/**
 * The image's bytes, or null when the person cancelled the picker. A screenshot copied to
 * the clipboard comes as a PNG, so its text stays sharp.
 */
export async function readImage(source: ImageSource): Promise<Uint8Array | null> {
  if (source === 'clipboard') {
    // On iOS this is when the phone asks whether Flare may paste.
    const image = await Clipboard.getImageAsync({ format: 'png' });
    if (!image) throw new NoImage('There’s no image on the clipboard');
    // A data URL: "data:image/png;base64,…".
    return fromBase64(image.data.slice(image.data.indexOf(',') + 1));
  }
  if (source === 'camera') {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) throw new NoImage('Flare isn’t allowed to use the camera. Allow it in Settings.');
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
      : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
  if (result.canceled) return null;
  const base64 = result.assets[0]?.base64;
  if (!base64) throw new NoImage('Couldn’t read that image');
  return fromBase64(base64);
}
