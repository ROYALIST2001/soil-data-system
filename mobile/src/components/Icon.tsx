import React from "react";
import Svg, { Path } from "react-native-svg";
import { colors } from "../theme";

const paths = {
  sprout: ["M12 21v-9", "M12 15C5 15 3 11 3 6c6 0 9 3 9 9Z", "M12 12c0-6 3-9 9-9 0 6-3 9-9 9Z"],
  flask: ["M9 3h6M10 3v6L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9V3", "M8 14h8", "M10 18h.01M14 17h.01"],
  chart: ["M4 3v17h17", "m7 14 4-5 4 3 5-7"],
  map: ["m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z", "M9 3v15M15 6v15"],
  layers: ["m12 3 10 5-10 5L2 8l10-5Z", "m2 12 10 5 10-5", "m2 16 10 5 10-5"],
  chat: ["M21 11a8 8 0 0 1-8 8H6l-4 3V11a9 9 0 0 1 19 0Z", "M7 10h10M7 14h6"],
  field: ["M3 5h18v15H3V5Z", "M3 11h18M9 11v9M15 11v9", "M7 5V2M17 5V2"],
  grid: ["M3 3h7v7H3V3ZM14 3h7v7h-7V3ZM3 14h7v7H3v-7ZM14 14h7v7h-7v-7Z"],
  shield: ["M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7l-9-4Z", "m8 12 3 3 5-6"],
  wallet: ["M20 7H5a2 2 0 0 1 0-4h13v4", "M3 5v14a2 2 0 0 0 2 2h15V7", "M20 12h-5v5h5M16 14.5h.01"],
  user: ["M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z", "M4 21v-2a8 8 0 0 1 16 0v2"],
  arrow: ["M4 12h16m-6-6 6 6-6 6"],
  chevron: ["m9 5 7 7-7 7"],
  chevronDown: ["m6 9 6 6 6-6"],
  check: ["m5 12 4 4L19 6"],
  location: ["M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z", "M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"],
  plus: ["M12 5v14M5 12h14"],
  send: ["m22 2-7 20-4-9L2 9 22 2Z", "m22 2-11 11"],
  refresh: ["M20 7a9 9 0 1 0 1 8", "M20 2v6h-6"],
  close: ["m6 6 12 12M6 18 18 6"],
  logout: ["M9 3H3v18h6", "M9 12h12m-5-5 5 5-5 5"],
} as const;

export type IconName = keyof typeof paths;

export default function Icon({ name, size = 24, color = colors.primary, strokeWidth = 1.8 }: {
  name: IconName; size?: number; color?: string; strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden={true}>
      {paths[name].map((d, index) => (
        <Path key={index} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}
