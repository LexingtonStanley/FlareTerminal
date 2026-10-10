import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';

import { readImage } from './image-source';

jest.mock('expo-clipboard', () => ({ getImageAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  ...jest.requireActual('expo-image-picker'),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));

const getImage = jest.mocked(Clipboard.getImageAsync);
const library = jest.mocked(ImagePicker.launchImageLibraryAsync);
const camera = jest.mocked(ImagePicker.launchCameraAsync);
const cameraPermission = jest.mocked(ImagePicker.requestCameraPermissionsAsync);

const picked = (base64: string | null): ImagePicker.ImagePickerResult => ({
  canceled: false,
  assets: [{ uri: 'file:///photo.jpg', width: 4, height: 3, base64 }],
});

beforeEach(() => jest.resetAllMocks());

describe('readImage', () => {
  it('reads a PNG off the clipboard', async () => {
    getImage.mockResolvedValue({
      data: 'data:image/png;base64,iVBORw==',
      size: { width: 1, height: 1 },
    });

    expect(await readImage('clipboard')).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    expect(getImage).toHaveBeenCalledWith({ format: 'png' });
  });

  it('says when the clipboard holds no image', async () => {
    getImage.mockResolvedValue(null);
    await expect(readImage('clipboard')).rejects.toThrow('There’s no image on the clipboard');
  });

  it('asks for a photo re-encoded, with no metadata', async () => {
    library.mockResolvedValue(picked('/9j/'));

    expect(await readImage('library')).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
    expect(library).toHaveBeenCalledWith({
      mediaTypes: 'images',
      base64: true,
      quality: 0.8,
      exif: false,
    });
  });

  it('is null when the person backs out of the picker', async () => {
    library.mockResolvedValue({ canceled: true, assets: null });
    expect(await readImage('library')).toBeNull();
  });

  it('takes a photo once the camera is allowed', async () => {
    cameraPermission.mockResolvedValue({ granted: true } as ImagePicker.CameraPermissionResponse);
    camera.mockResolvedValue(picked('/9j/'));

    expect(await readImage('camera')).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });

  it('says where to allow the camera when it isn’t', async () => {
    cameraPermission.mockResolvedValue({ granted: false } as ImagePicker.CameraPermissionResponse);

    await expect(readImage('camera')).rejects.toThrow('Allow it in Settings');
    expect(camera).not.toHaveBeenCalled();
  });
});
