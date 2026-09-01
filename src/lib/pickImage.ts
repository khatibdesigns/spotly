// Spotly — shared photo picker. Lets the user TAKE a photo or pick one from the
// library, handling permissions. Returns the chosen image URI (or null).
import { Alert, InteractionManager } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

type Labels = { title?: string; camera?: string; library?: string; cancel?: string; permTitle?: string; permMsg?: string };

// iPad fix: tapping a button in Alert.alert begins dismissing that alert. If we
// call launchCameraAsync/launchImageLibraryAsync immediately, UIKit on iPad
// silently refuses to present the new modal while the alert's dismissal
// transition is still in flight, so nothing happens ("Take photo did no action"
// in Apple review). Waiting for interactions to settle lets the alert finish
// dismissing before we present the camera/library. iPhone is more forgiving but
// this is harmless there too.
const afterDismiss = (): Promise<void> =>
  new Promise((resolve) => InteractionManager.runAfterInteractions(() => setTimeout(resolve, 450)));

export function choosePhoto(opts: { square?: boolean; labels?: Labels } = {}): Promise<string | null> {
  const L: Required<Labels> = {
    title: 'Add a photo',
    camera: 'Take photo',
    library: 'Choose from library',
    cancel: 'Cancel',
    permTitle: 'Permission needed',
    permMsg: 'Please allow access in Settings.',
    ...(opts.labels || {}),
  };
  const pickerOpts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.7,
    ...(opts.square ? { allowsEditing: true, aspect: [1, 1] as [number, number] } : {}),
  };
  const run = async (camera: boolean): Promise<string | null> => {
    const perm = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert(L.permTitle, L.permMsg); return null; }
    await afterDismiss();
    try {
      const res = camera ? await ImagePicker.launchCameraAsync(pickerOpts) : await ImagePicker.launchImageLibraryAsync(pickerOpts);
      return res.canceled || !res.assets?.[0] ? null : res.assets[0].uri;
    } catch (e) {
      Alert.alert(L.permTitle, L.permMsg);
      return null;
    }
  };
  return new Promise((resolve) => {
    Alert.alert(
      L.title,
      undefined,
      [
        { text: L.camera, onPress: () => run(true).then(resolve) },
        { text: L.library, onPress: () => run(false).then(resolve) },
        { text: L.cancel, style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) }
    );
  });
}

// Multi-select variant — take one photo (camera) or pick several from the
// library. Returns the chosen image URIs (empty if cancelled). Used for family
// memories, where one outing can have several photos.
export function choosePhotos(opts: { labels?: Labels; limit?: number } = {}): Promise<string[]> {
  const L: Required<Labels> = {
    title: 'Add photos',
    camera: 'Take photo',
    library: 'Choose from library',
    cancel: 'Cancel',
    permTitle: 'Permission needed',
    permMsg: 'Please allow access in Settings.',
    ...(opts.labels || {}),
  };
  const run = async (camera: boolean): Promise<string[]> => {
    const perm = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert(L.permTitle, L.permMsg); return []; }
    await afterDismiss();
    try {
      if (camera) {
        const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
        return res.canceled || !res.assets?.[0] ? [] : [res.assets[0].uri];
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsMultipleSelection: true,
        selectionLimit: opts.limit ?? 20,
      });
      return res.canceled ? [] : (res.assets || []).map((a) => a.uri).filter(Boolean);
    } catch (e) {
      Alert.alert(L.permTitle, L.permMsg);
      return [];
    }
  };
  return new Promise((resolve) => {
    Alert.alert(
      L.title,
      undefined,
      [
        { text: L.camera, onPress: () => run(true).then(resolve) },
        { text: L.library, onPress: () => run(false).then(resolve) },
        { text: L.cancel, style: 'cancel', onPress: () => resolve([]) },
      ],
      { cancelable: true, onDismiss: () => resolve([]) }
    );
  });
}
