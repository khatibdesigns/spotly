// Spotly — share a booking pass as an image (QR + caption), not just text.
// Captures the QRCode SVG to a PNG, then opens the native share sheet.
import { Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

type QrRef = { toDataURL?: (cb: (base64: string) => void) => void } | null | undefined;

// `ref` is the react-native-qrcode-svg component ref (has toDataURL). `caption`
// is the text we attach. Falls back to a plain text share if the image fails.
export function shareQr(ref: QrRef, caption: string, filename = 'spotly-pass.png') {
  const fallback = () => { Share.share({ message: caption }).catch(() => {}); };
  if (!ref?.toDataURL) { fallback(); return; }
  try {
    ref.toDataURL(async (base64: string) => {
      try {
        const uri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: caption, UTI: 'public.png' });
        } else {
          fallback();
        }
      } catch {
        fallback();
      }
    });
  } catch {
    fallback();
  }
}
