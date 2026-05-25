// Spotly — icon set ported to react-native-svg.
// Brand mark + wordmark, UI icons, amenity icons, age badges.
import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import { C, F } from '../lib/theme';

export type IconProps = {
  size?: number;
  color?: string;
  filled?: boolean;
  strokeWidth?: number;
};

// Generic stroke-icon factory (mirrors the web _ico helper).
const ico =
  (paths: React.ReactNode, vb = 24) =>
  ({ size = 20, color = C.ink, strokeWidth = 1.8, filled = false }: IconProps) =>
    (
      <Svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`}>
        <G
          fill={filled ? color : 'none'}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {paths}
        </G>
      </Svg>
    );

// ── Brand mark — pin with a star "found place" glyph ──────────
export const Mark = ({ size = 28, color = C.coral }: { size?: number; color?: string }) => (
  <Svg width={size} height={size * 1.18} viewBox="0 0 100 118">
    <Path
      d="M50 4 C24 4 6 22 6 47 c0 23 18 41 38 65 c2 2 4 2 6 2 c2 0 4 0 6-2 c20-24 38-42 38-65 C94 22 76 4 50 4z"
      fill={color}
    />
    <Circle cx="50" cy="46" r="22" fill="white" fillOpacity={0.96} />
    <Path d="M50 33 l4.5 9 10 1.5 -7.2 7 1.7 10 -9-4.8 -9 4.8 1.7-10 -7.2-7 10-1.5z" fill={color} />
  </Svg>
);

// ── Wordmark — "Spotly" with the o as a map pin ───────────────
export const Wordmark = ({
  size = 40,
  color = C.ink,
  accent = C.coral,
}: {
  size?: number;
  color?: string;
  accent?: string;
}) => (
  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    <Text
      style={{
        fontFamily: F.extrabold,
        fontSize: size,
        lineHeight: size * 1.05,
        letterSpacing: -size * 0.04,
        color,
      }}
    >
      Sp
    </Text>
    <Svg
      width={size * 0.78}
      height={size * 0.92}
      viewBox="0 0 100 118"
      style={{ transform: [{ translateY: size * 0.04 }] }}
    >
      <Path
        d="M50 6 C26 6 8 24 8 47 c0 22 18 40 38 64 c2 2 4 2 6 2 c2 0 4 0 6-2 c20-24 38-42 38-64 C92 24 74 6 50 6z"
        fill={accent}
      />
      <Circle cx="50" cy="47" r="14" fill="white" />
    </Svg>
    <Text
      style={{
        fontFamily: F.extrabold,
        fontSize: size,
        lineHeight: size * 1.05,
        letterSpacing: -size * 0.04,
        color,
      }}
    >
      tly
    </Text>
  </View>
);

// ── Tab + UI icons (custom shapes) ────────────────────────────
export const compass = ({ size = 22, color = C.ink, filled = false }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx="12" cy="12" r="9.2" fill={filled ? color : 'none'} stroke={color} strokeWidth={1.9} />
    <Path
      d="M15.5 8.5l-2 5.5 -5.5 2 2-5.5 5.5-2z"
      fill={filled ? 'white' : 'none'}
      stroke={filled ? 'white' : color}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);
export const calendar = ({ size = 22, color = C.ink, filled = false }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x="3.5" y="5.5" width="17" height="15" rx="3" fill={filled ? color : 'none'} stroke={color} strokeWidth={1.9} />
    <Path d="M8 3.5v4M16 3.5v4M3.5 10h17" stroke={filled ? 'white' : color} strokeWidth={1.9} strokeLinecap="round" />
  </Svg>
);
export const pin = ({ size = 22, color = C.ink, filled = false }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M12 2.5C7.5 2.5 4 6 4 10.4 c0 5 6 10 7.2 11 c.5.4 1.2.4 1.7 0 C14 20.4 20 15.4 20 10.4 C20 6 16.5 2.5 12 2.5z"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth={1.9}
      strokeLinejoin="round"
    />
    <Circle cx="12" cy="10.4" r="3" fill={filled ? 'white' : 'none'} stroke={filled ? 'white' : color} strokeWidth={1.9} />
  </Svg>
);
export const album = ({ size = 22, color = C.ink, filled = false }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x="3.5" y="4" width="14" height="17" rx="2.5" fill={filled ? color : 'none'} stroke={color} strokeWidth={1.9} />
    <Path d="M7 4v17" stroke={filled ? 'white' : color} strokeWidth={1.9} strokeLinecap="round" />
    <Path d="M20 7v13a1.5 1.5 0 01-1.5 1.5" stroke={color} strokeWidth={1.9} strokeLinecap="round" fill="none" />
  </Svg>
);
export const user = ({ size = 22, color = C.ink, filled = false }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx="12" cy="8.5" r="3.5" fill={filled ? color : 'none'} stroke={color} strokeWidth={1.9} />
    <Path
      d="M4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const search = ico(<Path d="M11 4a7.2 7.2 0 100 14.4A7.2 7.2 0 0011 4zM16.5 16.5L21 21" />);
export const filter = ico(<Path d="M3 6h18M6 12h12M10 18h4" />);
export const heart = ({ size = 20, color = C.ink, filled = false }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M12 20.3s-7.5-4.5-9.3-9C1.6 8 3.7 4.5 7 4.5c2 0 3.7 1.1 5 3 1.3-1.9 3-3 5-3 3.3 0 5.4 3.5 4.3 6.8C19.5 15.8 12 20.3 12 20.3z"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth={1.8}
      strokeLinejoin="round"
    />
  </Svg>
);
export const bookmark = ({ size = 20, color = C.ink, filled = false }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M6 3.5h12v18l-6-4-6 4v-18z"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth={1.8}
      strokeLinejoin="round"
    />
  </Svg>
);
export const share = ico(
  <>
    <Circle cx="6" cy="12" r="2.4" />
    <Circle cx="18" cy="6" r="2.4" />
    <Circle cx="18" cy="18" r="2.4" />
    <Path d="M8 10.5l8-3.5M8 13.5l8 3.5" />
  </>
);
export const arrowR = ico(<Path d="M5 12h14M13 6l6 6-6 6" />);
export const arrowL = ico(<Path d="M19 12H5M11 6l-6 6 6 6" />);
export const arrowUp = ico(<Path d="M12 19V5M6 11l6-6 6 6" />);
export const close = ico(<Path d="M6 6l12 12M18 6L6 18" />);
export const check = ico(<Path d="M5 12.5l4.5 4.5L19 7" />);
export const plus = ico(<Path d="M12 5v14M5 12h14" />);
export const more = ico(
  <>
    <Circle cx="5" cy="12" r="1.4" fill={C.ink} />
    <Circle cx="12" cy="12" r="1.4" fill={C.ink} />
    <Circle cx="19" cy="12" r="1.4" fill={C.ink} />
  </>
);
export const camera = ico(
  <>
    <Path d="M4 8.5h3l1.5-2.5h7L17 8.5h3v11H4v-11z" />
    <Circle cx="12" cy="14" r="3.4" />
  </>
);
export const sparkle = ico(<Path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />);
export const clock = ico(
  <>
    <Circle cx="12" cy="12" r="9" />
    <Path d="M12 7v5l3 2" />
  </>
);
export const phone = ico(
  <Path d="M5 4.5h3l2 5-2.5 1.5a11 11 0 005.5 5.5L14.5 14l5 2v3a2 2 0 01-2 2A14 14 0 013 6.5a2 2 0 012-2z" />
);
export const directions = ico(
  <>
    <Path d="M12 2.5L22 12.5l-10 10 -10-10L12 2.5z" />
    <Path d="M9 14v-3a2 2 0 012-2h4M15 9l-2-2M15 9l-2 2" />
  </>
);
export const globe = ico(
  <>
    <Circle cx="12" cy="12" r="9" />
    <Path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
  </>
);
export const lock = ico(
  <>
    <Rect x="5" y="11" width="14" height="10" rx="2" />
    <Path d="M8 11V7.5a4 4 0 018 0V11" />
  </>
);
export const chevR = ico(<Path d="M9 6l6 6-6 6" />);
export const chevD = ico(<Path d="M6 9l6 6 6-6" />);

// ── Amenity icons ─────────────────────────────────────────────
export const playArea = ico(
  <>
    <Path d="M3 21v-3l4-2 0-4 2-2 6 6-2 2-4 0-2 4-3 4z" />
    <Circle cx="16.5" cy="7.5" r="3" />
  </>
);
export const foodOnSite = ico(<Path d="M5 3v8a3 3 0 003 3v7M8 3v6M19 3c-2 0-3 2-3 4s1 4 3 4v7" />);
export const parking = ico(
  <>
    <Rect x="4" y="4" width="16" height="16" rx="3.5" />
    <Path d="M9.5 17V8h3.5a3 3 0 010 6H9.5" />
  </>
);
export const stroller = ico(
  <>
    <Path d="M4 4h2l3 9h9" />
    <Circle cx="9" cy="18.5" r="2" />
    <Circle cx="17" cy="18.5" r="2" />
    <Path d="M9 13a6 6 0 016-6V13" />
  </>
);
export const changing = ico(
  <>
    <Rect x="3" y="11" width="18" height="9" rx="2" />
    <Circle cx="8" cy="7" r="2.5" />
    <Path d="M14 6h6M14 9h4" />
  </>
);
export const ac = ico(<Path d="M12 3v18M3 12h18M5.5 5.5l13 13M18.5 5.5l-13 13" />);
export const accessible = ico(
  <>
    <Circle cx="12" cy="5" r="2" />
    <Path d="M9 9l3 4h3l3 5M9 9v6a3 3 0 003 3" />
  </>
);
export const restroom = ico(
  <Path d="M8 21v-6H5l2-7a2 2 0 012-2 2 2 0 012 2l2 7H10v6M17 21v-5h-2l1.5-7M17 21v-5h2l-1.5-7M17 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
);
export const indoor = ico(
  <>
    <Path d="M3 11l9-7 9 7v9a1 1 0 01-1 1H4a1 1 0 01-1-1v-9z" />
    <Path d="M10 21v-6h4v6" />
  </>
);
export const outdoor = ico(
  <>
    <Circle cx="12" cy="12" r="3.5" />
    <Path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.5 1.5M17 17l1.5 1.5M5.5 18.5l1.5-1.5M17 7l1.5-1.5" />
  </>
);
export const water = ico(<Path d="M12 3s-7 8-7 13a7 7 0 0014 0c0-5-7-13-7-13z" />);
export const animals = ico(
  <>
    <Circle cx="6" cy="9" r="2" />
    <Circle cx="18" cy="9" r="2" />
    <Circle cx="4" cy="14" r="1.5" />
    <Circle cx="20" cy="14" r="1.5" />
    <Path d="M12 13c-3 0-5 2-5 4 0 2 2 3 5 3s5-1 5-3c0-2-2-4-5-4z" />
  </>
);
export const arts = ico(
  <>
    <Path d="M12 3a9 9 0 109 9c0-1.5-1.2-2.5-3-2.5h-1.5a2 2 0 01-2-2.5C14.5 5 13.5 3 12 3z" />
    <Circle cx="7.5" cy="11" r="1" fill={C.ink} />
    <Circle cx="9" cy="7" r="1" fill={C.ink} />
    <Circle cx="14" cy="6" r="1" fill={C.ink} />
  </>
);
export const sport = ico(
  <>
    <Circle cx="12" cy="12" r="9" />
    <Path d="M12 3v18M3 12h18M5 5l14 14M19 5L5 19" />
  </>
);
export const museum = ico(<Path d="M3 21h18M4 21V10l8-6 8 6v11M9 21v-8M15 21v-8" />);
export const free = ico(
  <>
    <Circle cx="12" cy="12" r="9" />
    <Path d="M9 8h6M9 12h5M9 8v9" />
  </>
);
export const shade = ico(<Path d="M12 3l9 6H3l9-6zM12 9v12M12 21l-3-2M12 21l3-2" />);
// Shopping bag — kids/baby shops.
export const shop = ico(
  <>
    <Path d="M5 8h14l-1 12H6L5 8z" />
    <Path d="M9 8V6a3 3 0 016 0v2" />
  </>
);
// Fork & knife — dining / restaurants.
export const dining = ico(<Path d="M6 3v7a2 2 0 002 2v9M8 3v7M17 3c-1.5 0-2.5 1.5-2.5 3.5S15.5 12 17 12v9" />);

// Age badges — colored bubble with the range label.
const ageBadge =
  (range: string) =>
  ({ size = 24, color = C.ink }: { size?: number; color?: string }) =>
    (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: 'white', fontFamily: F.extrabold, fontSize: size * 0.4, letterSpacing: -0.5 }}>
          {range}
        </Text>
      </View>
    );

export const age03 = ageBadge('0-3');
export const age47 = ageBadge('4-7');
export const age812 = ageBadge('8-12');

export const Icons = {
  Mark,
  Wordmark,
  compass,
  calendar,
  pin,
  album,
  user,
  search,
  filter,
  heart,
  bookmark,
  share,
  arrowR,
  arrowL,
  arrowUp,
  close,
  check,
  plus,
  more,
  chevR,
  chevD,
  camera,
  sparkle,
  clock,
  phone,
  directions,
  globe,
  lock,
  playArea,
  foodOnSite,
  parking,
  stroller,
  changing,
  ac,
  accessible,
  restroom,
  indoor,
  outdoor,
  water,
  animals,
  arts,
  sport,
  museum,
  free,
  shade,
  shop,
  dining,
  age03,
  age47,
  age812,
};
