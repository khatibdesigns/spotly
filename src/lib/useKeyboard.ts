import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// Returns the current on-screen keyboard height (0 when hidden).
//
// Why this exists: on Android with Expo SDK 56's enforced edge-to-edge, the
// activity window no longer resizes when the keyboard opens, so the manifest's
// `adjustResize` can't shrink the scroll area to reveal a covered field. iOS is
// fine (KeyboardAvoidingView `padding` + ScrollView `automaticallyAdjustKeyboardInsets`).
//
// Screens add this height as extra bottom padding to their scroll content ONLY
// on Android, which gives the ScrollView room to scroll the focused TextInput
// above the keyboard (React Native auto-scrolls the focused input into view when
// the content is tall enough). Using `androidKeyboardPad()` avoids double-padding
// on iOS, where the keyboard is already handled.
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates?.height ?? 0));
    const onHide = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);
  return height;
}

// Extra bottom padding a scroll form should add so a focused field clears the
// keyboard. 0 on iOS (handled natively), the live keyboard height on Android.
export function useAndroidKeyboardPad(): number {
  const h = useKeyboardHeight();
  return Platform.OS === 'android' ? h : 0;
}
