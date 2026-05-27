// Spotly — shared photo picker. Lets the user TAKE a photo or pick one from the
// library, handling permissions. Returns the chosen image URI (or null).
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

type Labels = { title?: string; camera?: string; library?: string; cancel?: string; permTitle?: string; permMsg?: string };

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
    const res = camera ? await ImagePicker.launchCameraAsync(pickerOpts) : await ImagePicker.launchImageLibraryAsync(pickerOpts);
    return res.canceled || !res.assets?.[0] ? null : res.assets[0].uri;
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
