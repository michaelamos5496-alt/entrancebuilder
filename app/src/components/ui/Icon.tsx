import type { SVGProps } from "react";

const PATHS = {
  undo: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  redo: "m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3",
  reset: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  flip: "M12 3v18M8 7 3 12l5 5V7ZM16 7l5 5-5 5V7Z",
  image: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M9 9.5h.01",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  share: "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14",
  print: "M7 9V3h10v6M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z",
  save: "M5 3h11l3 3v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM8 3v5h7V3M8 21v-7h8v7",
  search: "m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z",
  close: "M6 6l12 12M18 6 6 18",
  check: "m5 12 5 5L20 7",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  chevron: "m9 6 6 6-6 6",
  info: "M12 11v6M12 7.5v.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  mail: "M3 6h18v12H3zM3 7l9 7 9-7",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  home: "M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10",
  door: "M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16M14.5 12.5v.01",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  edit: "M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4",
  copy: "M9 9h11v11H9zM5 15V4h11",
  menu: "M4 7h16M4 12h16M4 17h16",
  alert: "M12 9v4M12 17v.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
