// Spotly — lightweight i18n + RTL. Two languages (English / Arabic). The chosen
// language is persisted in AsyncStorage; RTL is driven by React Native's
// I18nManager (which persists natively across launches). Switching to/from
// Arabic flips layout direction and asks the user to restart the app.
import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { I18nManager, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Lang = 'en' | 'ar';
const STORE_KEY = 'spotly.lang';

type Vars = Record<string, string | number>;

// Flat key → string. English is the source/fallback; Arabic is Modern Standard.
const EN: Record<string, string> = {
  // tabs
  'tab.discover': 'Discover',
  'tab.plan': 'Plan',
  'tab.map': 'Map',
  'tab.gallery': 'Gallery',
  'tab.profile': 'Profile',
  // common
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.done': 'Done',
  'common.edit': 'Edit',
  'common.add': 'Add',
  'common.seeAll': 'See all',
  'common.retry': 'Try again',
  'common.clear': 'Clear',
  'common.set': 'Set',
  // kinds / filters / categories
  'kind.activity': 'Activities',
  'kind.dining': 'Dining',
  'kind.shop': 'Kids & baby shops',
  'filter.playArea': 'Has play area',
  'filter.openNow': 'Open now',
  'filter.free': 'Free',
  'filter.indoor': 'Indoor',
  'cat.parks': 'Parks',
  'cat.indoorPlay': 'Indoor play',
  'cat.dining': 'Dining',
  'cat.kidsShops': 'Kids shops',
  'cat.museums': 'Museums',
  'cat.zoos': 'Zoos',
  'cat.water': 'Water',
  // discover
  'discover.morning': 'Good morning,',
  'discover.afternoon': 'Good afternoon,',
  'discover.evening': 'Good evening,',
  'discover.nearYou': 'Near you',
  'discover.thisWeek': 'This week near you',
  'discover.whereToday': 'Where to today?',
  'discover.filters': 'Filters',
  'discover.tastesEyebrow': 'Tastes they’ll love',
  'discover.eatsFor': 'Eats for {names} fans',
  'discover.pickedFor': 'Picked for {names}',
  'discover.locBanner': 'Showing Kuwait. Turn on location for spots near you.',
  'discover.enable': 'Enable',
  'discover.finding': 'Finding spots near you…',
  'discover.noMatch': 'No spots match those filters.',
  'discover.noNearby': 'No spots found nearby.',
  'discover.loosen': 'Loosen a filter and we’ll find you somewhere new.',
  'discover.checkConn': 'Try again, or check your connection and location settings.',
  'discover.clearFilters': 'Clear filters',
  'discover.editorPick': 'EDITOR’S PICK',
  'discover.nearYouTag': 'NEAR YOU',
  // plan
  'plan.title': 'Plan',
  'plan.eyebrow': 'Your weekends, sorted',
  'plan.aiTitle': 'Plan a trip with AI',
  'plan.aiSub': '“4 days in France with the kids…” → a full itinerary',
  'plan.empty': 'No plans yet.',
  'plan.emptySub': 'Ask the AI planner above, or add a spot from Discover with “Add to Plan.”',
  'plan.browse': 'Browse places',
  'plan.upcoming': 'Upcoming',
  'plan.afterDay': 'After the day · add your memories',
  'plan.days': '{n} days',
  'plan.stops': '{n} stops',
  'plan.addCalendar': 'Add to calendar',
  'plan.markDone': 'Mark done',
  'plan.addPhotos': 'Add photos',
  'plan.deleteWhole': 'Delete whole plan',
  'plan.removeStopTitle': 'Remove stop',
  'plan.removeStopMsg': 'Remove “{name}” from this plan?',
  'plan.remove': 'Remove',
  'plan.deleteTitle': 'Delete plan',
  'plan.deleteMsg': 'Delete “{title}”? This can’t be undone.',
  'plan.calAdded': 'Added to calendar',
  'plan.calAddedMsg': 'Your plan is on your calendar for the upcoming weekend.',
  'plan.calErr': 'Could not add to calendar.',
  // map
  'map.discoverNearby': 'Discover nearby',
  'map.placesBeen': 'Places we’ve been',
  'map.countries': 'countries',
  'map.spots': 'spots',
  'map.nearbyStat': 'nearby',
  'map.weekends': 'weekends',
  'map.noMemories': 'No memories pinned yet.',
  'map.noMemoriesSub': 'Add photos with a city in Gallery and they’ll appear here.',
  'map.seeDetails': 'See details',
  'map.directions': 'Directions',
  // gallery
  'gallery.title': 'Gallery',
  'gallery.memoryCount': '{m} memories · {p} places',
  'gallery.startAlbum': 'Start your family album.',
  'gallery.startSub': 'Add a photo from a place you visited — we’ll build your timeline, map, and printable albums over time.',
  'gallery.addMemory': 'Add a memory',
  'gallery.keepsake': 'Keepsake',
  'gallery.turnInto': 'Turn {n} memories into\na printed album.',
  'gallery.makeAlbum': 'Make album',
  'gallery.addMore': 'Add more',
  'gallery.recent': 'Recent memories',
  'gallery.placesBeen': 'Places we’ve been',
  'gallery.visits': '{n} visits',
  'gallery.visit': '{n} visit',
  'gallery.place': 'Place',
  'gallery.placeHint': 'Where was this?',
  'gallery.city': 'City',
  'gallery.cityHint': 'e.g. Kuwait City',
  'gallery.note': 'Note',
  'gallery.noteHint': 'A little memory…',
  'gallery.saveMemory': 'Save memory',
  'gallery.saving': 'Saving…',
  'gallery.permTitle': 'Photos permission needed',
  'gallery.permMsg': 'Allow photo access to add a memory.',
  // profile
  'profile.family': 'Family',
  'profile.parentYou': 'Parent · you',
  'profile.ageFmt': 'Age {age}',
  'profile.addFood': 'Add food preferences',
  'profile.lovesAvoids': 'loves {fav}',
  'profile.avoids': 'avoids {n}',
  'profile.passport': 'Your passport',
  'profile.activity': 'Activity',
  'profile.savedSpots': 'Saved spots',
  'profile.placesVisited': 'Places visited',
  'profile.memories': 'Memories',
  'profile.bookings': 'Bookings',
  'profile.settings': 'Settings',
  'profile.homeLoc': 'Home & location',
  'profile.language': 'Language',
  'profile.privacy': 'Privacy',
  'profile.notifications': 'Notifications',
  'profile.signOut': 'Sign out',
  'profile.plusTitle': 'Spotly Plus',
  'profile.plusActive': 'Unlimited memories · active',
  'profile.plusUnlock': 'Unlock unlimited memories & more',
  'profile.manage': 'Manage',
  'profile.upgrade': 'Upgrade',
  'profile.langTitle': 'Language',
  'profile.langChoose': 'Choose your language',
  'profile.restartTitle': 'Restart needed',
  'profile.restartMsg': 'Spotly will switch to {lang} and change layout direction. Please fully close and reopen the app.',
  // place detail
  'place.openNow': 'OPEN NOW',
  'place.closed': 'CLOSED',
  'place.reviews': '{n} reviews',
  'place.whatFind': 'What you’ll find',
  'place.tapGo': 'Tap Go for directions',
  'place.go': 'Go',
  'place.addToPlan': 'Add to plan',
  'place.requestBook': 'Request to book →',
  'place.allergy': 'Allergy reminder — your family avoids {foods}. Check the menu before ordering.',
  'place.couldNotAdd': 'Could not add to plan',
  // filters sheet
  'filters.title': 'Filters',
  'filters.reset': 'Reset',
  'filters.lookingFor': 'Looking for',
  'filters.amenities': 'Amenities',
  'filters.price': 'Price',
  'filters.more': 'More',
  'filters.showN': 'Show {n} places',
  'filters.showOne': 'Show {n} place',
  // kid food
  'food.titleFallback': 'Food preferences',
  'food.sub': 'What to serve, what to skip',
  'food.loves': 'Loves to eat',
  'food.addFav': 'Add a favourite…',
  'food.cantHave': 'Can’t have · avoid',
  'food.cantHaveSub': 'Allergies or foods not allowed. We’ll never recommend places built around these.',
  'food.addAllergy': 'Add an allergy / restriction…',
  'food.savePrefs': 'Save preferences',
};

const AR: Record<string, string> = {
  // tabs
  'tab.discover': 'اكتشف',
  'tab.plan': 'الخطة',
  'tab.map': 'الخريطة',
  'tab.gallery': 'الألبوم',
  'tab.profile': 'الحساب',
  // common
  'common.cancel': 'إلغاء',
  'common.save': 'حفظ',
  'common.done': 'تم',
  'common.edit': 'تعديل',
  'common.add': 'إضافة',
  'common.seeAll': 'عرض الكل',
  'common.retry': 'حاول مجددًا',
  'common.clear': 'مسح',
  'common.set': 'تعيين',
  // kinds / filters / categories
  'kind.activity': 'أنشطة',
  'kind.dining': 'مطاعم',
  'kind.shop': 'متاجر الأطفال والرضّع',
  'filter.playArea': 'منطقة لعب',
  'filter.openNow': 'مفتوح الآن',
  'filter.free': 'مجاني',
  'filter.indoor': 'داخلي',
  'cat.parks': 'حدائق',
  'cat.indoorPlay': 'لعب داخلي',
  'cat.dining': 'مطاعم',
  'cat.kidsShops': 'متاجر أطفال',
  'cat.museums': 'متاحف',
  'cat.zoos': 'حدائق حيوان',
  'cat.water': 'ألعاب مائية',
  // discover
  'discover.morning': 'صباح الخير،',
  'discover.afternoon': 'مساء الخير،',
  'discover.evening': 'مساء الخير،',
  'discover.nearYou': 'بالقرب منك',
  'discover.thisWeek': 'هذا الأسبوع بالقرب منك',
  'discover.whereToday': 'إلى أين اليوم؟',
  'discover.filters': 'الفلاتر',
  'discover.tastesEyebrow': 'نكهات يحبّونها',
  'discover.eatsFor': 'مطاعم لمحبّي {names}',
  'discover.pickedFor': 'مختارة لـ {names}',
  'discover.locBanner': 'نعرض الكويت. فعّل الموقع لأماكن قريبة منك.',
  'discover.enable': 'تفعيل',
  'discover.finding': 'نبحث عن أماكن قريبة…',
  'discover.noMatch': 'لا توجد أماكن تطابق هذه الفلاتر.',
  'discover.noNearby': 'لا توجد أماكن قريبة.',
  'discover.loosen': 'خفّف أحد الفلاتر لنجد لك مكانًا جديدًا.',
  'discover.checkConn': 'حاول مجددًا، أو تحقّق من اتصالك وإعدادات الموقع.',
  'discover.clearFilters': 'مسح الفلاتر',
  'discover.editorPick': 'اختيار المحرّر',
  'discover.nearYouTag': 'بالقرب منك',
  // plan
  'plan.title': 'الخطة',
  'plan.eyebrow': 'عطلاتك مرتّبة',
  'plan.aiTitle': 'خطّط رحلة بالذكاء الاصطناعي',
  'plan.aiSub': '«٤ أيام في فرنسا مع الأطفال…» ← خطة كاملة',
  'plan.empty': 'لا توجد خطط بعد.',
  'plan.emptySub': 'اسأل المخطّط الذكي بالأعلى، أو أضف مكانًا من «اكتشف» عبر «أضف إلى الخطة».',
  'plan.browse': 'تصفّح الأماكن',
  'plan.upcoming': 'قادمة',
  'plan.afterDay': 'بعد اليوم · أضف ذكرياتك',
  'plan.days': '{n} أيام',
  'plan.stops': '{n} محطات',
  'plan.addCalendar': 'أضف إلى التقويم',
  'plan.markDone': 'تم الإنجاز',
  'plan.addPhotos': 'أضف صورًا',
  'plan.deleteWhole': 'حذف الخطة بالكامل',
  'plan.removeStopTitle': 'إزالة المحطة',
  'plan.removeStopMsg': 'إزالة «{name}» من هذه الخطة؟',
  'plan.remove': 'إزالة',
  'plan.deleteTitle': 'حذف الخطة',
  'plan.deleteMsg': 'حذف «{title}»؟ لا يمكن التراجع.',
  'plan.calAdded': 'أُضيفت إلى التقويم',
  'plan.calAddedMsg': 'خطتك في تقويمك لعطلة نهاية الأسبوع القادمة.',
  'plan.calErr': 'تعذّر الإضافة إلى التقويم.',
  // map
  'map.discoverNearby': 'اكتشف القريب',
  'map.placesBeen': 'أماكن زرناها',
  'map.countries': 'دول',
  'map.spots': 'أماكن',
  'map.nearbyStat': 'قريبة',
  'map.weekends': 'عطلات',
  'map.noMemories': 'لا ذكريات مثبّتة بعد.',
  'map.noMemoriesSub': 'أضف صورًا مع مدينة في الألبوم لتظهر هنا.',
  'map.seeDetails': 'التفاصيل',
  'map.directions': 'الاتجاهات',
  // gallery
  'gallery.title': 'الألبوم',
  'gallery.memoryCount': '{m} ذكريات · {p} أماكن',
  'gallery.startAlbum': 'ابدأ ألبوم عائلتك.',
  'gallery.startSub': 'أضف صورة من مكان زرته — وسنبني خطّك الزمني وخريطتك وألبوماتك القابلة للطباعة.',
  'gallery.addMemory': 'أضف ذكرى',
  'gallery.keepsake': 'تذكار',
  'gallery.turnInto': 'حوّل {n} ذكرى إلى\nألبوم مطبوع.',
  'gallery.makeAlbum': 'اصنع ألبومًا',
  'gallery.addMore': 'أضف المزيد',
  'gallery.recent': 'أحدث الذكريات',
  'gallery.placesBeen': 'أماكن زرناها',
  'gallery.visits': '{n} زيارات',
  'gallery.visit': '{n} زيارة',
  'gallery.place': 'المكان',
  'gallery.placeHint': 'أين كان هذا؟',
  'gallery.city': 'المدينة',
  'gallery.cityHint': 'مثال: مدينة الكويت',
  'gallery.note': 'ملاحظة',
  'gallery.noteHint': 'ذكرى صغيرة…',
  'gallery.saveMemory': 'احفظ الذكرى',
  'gallery.saving': 'جارٍ الحفظ…',
  'gallery.permTitle': 'إذن الصور مطلوب',
  'gallery.permMsg': 'اسمح بالوصول إلى الصور لإضافة ذكرى.',
  // profile
  'profile.family': 'العائلة',
  'profile.parentYou': 'الوالد · أنت',
  'profile.ageFmt': 'العمر {age}',
  'profile.addFood': 'أضف تفضيلات الطعام',
  'profile.lovesAvoids': 'يحب {fav}',
  'profile.avoids': 'يتجنّب {n}',
  'profile.passport': 'جواز سفرك',
  'profile.activity': 'النشاط',
  'profile.savedSpots': 'أماكن محفوظة',
  'profile.placesVisited': 'أماكن زرتها',
  'profile.memories': 'الذكريات',
  'profile.bookings': 'الحجوزات',
  'profile.settings': 'الإعدادات',
  'profile.homeLoc': 'المنزل والموقع',
  'profile.language': 'اللغة',
  'profile.privacy': 'الخصوصية',
  'profile.notifications': 'الإشعارات',
  'profile.signOut': 'تسجيل الخروج',
  'profile.plusTitle': 'سبوتلي بلس',
  'profile.plusActive': 'ذكريات غير محدودة · مفعّل',
  'profile.plusUnlock': 'افتح ذكريات غير محدودة والمزيد',
  'profile.manage': 'إدارة',
  'profile.upgrade': 'ترقية',
  'profile.langTitle': 'اللغة',
  'profile.langChoose': 'اختر لغتك',
  'profile.restartTitle': 'يلزم إعادة التشغيل',
  'profile.restartMsg': 'سيتحوّل سبوتلي إلى {lang} ويغيّر اتجاه الواجهة. الرجاء إغلاق التطبيق وفتحه من جديد.',
  // place detail
  'place.openNow': 'مفتوح الآن',
  'place.closed': 'مغلق',
  'place.reviews': '{n} تقييم',
  'place.whatFind': 'ما ستجده',
  'place.tapGo': 'اضغط «انطلق» للاتجاهات',
  'place.go': 'انطلق',
  'place.addToPlan': 'أضف إلى الخطة',
  'place.requestBook': 'اطلب الحجز ←',
  'place.allergy': 'تنبيه حساسية — عائلتك تتجنّب {foods}. تحقّق من القائمة قبل الطلب.',
  'place.couldNotAdd': 'تعذّر الإضافة إلى الخطة',
  // filters sheet
  'filters.title': 'الفلاتر',
  'filters.reset': 'إعادة تعيين',
  'filters.lookingFor': 'تبحث عن',
  'filters.amenities': 'الخدمات',
  'filters.price': 'السعر',
  'filters.more': 'المزيد',
  'filters.showN': 'عرض {n} مكان',
  'filters.showOne': 'عرض {n} مكان',
  // kid food
  'food.titleFallback': 'تفضيلات الطعام',
  'food.sub': 'ما يُقدَّم وما يُتجنَّب',
  'food.loves': 'يحب أن يأكل',
  'food.addFav': 'أضف طعامًا مفضّلًا…',
  'food.cantHave': 'ممنوع · يُتجنَّب',
  'food.cantHaveSub': 'حساسية أو أطعمة غير مسموحة. لن نوصي أبدًا بأماكن تعتمد عليها.',
  'food.addAllergy': 'أضف حساسية / قيدًا…',
  'food.savePrefs': 'احفظ التفضيلات',
};

const DICTS: Record<Lang, Record<string, string>> = { en: EN, ar: AR };

function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

type I18nState = {
  lang: Lang;
  isRTL: boolean;
  t: (key: string, vars?: Vars) => string;
  setLang: (l: Lang) => Promise<void>;
};

const Ctx = createContext<I18nState | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Initial guess from the natively-persisted RTL flag → no flash on relaunch.
  const [lang, setLangState] = useState<Lang>(I18nManager.isRTL ? 'ar' : 'en');

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((v) => { if (v === 'en' || v === 'ar') setLangState(v); })
      .catch(() => {});
  }, []);

  const t = useCallback(
    (key: string, vars?: Vars) => interpolate(DICTS[lang][key] ?? EN[key] ?? key, vars),
    [lang]
  );

  const setLang = useCallback(async (l: Lang) => {
    setLangState(l);
    try { await AsyncStorage.setItem(STORE_KEY, l); } catch {}
    const shouldRTL = l === 'ar';
    if (I18nManager.isRTL !== shouldRTL) {
      try {
        I18nManager.allowRTL(true);
        I18nManager.forceRTL(shouldRTL);
      } catch {}
      // Try a programmatic reload (expo-updates) if present; otherwise ask the
      // user to restart, since RTL only fully applies on a fresh launch.
      let reloaded = false;
      try {
        const Updates = require('expo-updates');
        if (Updates?.reloadAsync) { Updates.reloadAsync(); reloaded = true; }
      } catch {}
      if (!reloaded) {
        const langName = l === 'ar' ? (DICTS.ar['profile.language'] ? 'العربية' : 'Arabic') : 'English';
        Alert.alert(
          DICTS[l]['profile.restartTitle'] || 'Restart needed',
          interpolate(DICTS[l]['profile.restartMsg'] || 'Please restart the app.', { lang: langName })
        );
      }
    }
  }, []);

  return <Ctx.Provider value={{ lang, isRTL: I18nManager.isRTL, t, setLang }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be used within I18nProvider');
  return v;
}
