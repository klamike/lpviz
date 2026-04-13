export const NULL_STATE_LOGO_FONT_SIZE = 16;
export const NULL_STATE_LOGO_LINE_HEIGHT = 18;
export const NULL_STATE_LOGO_CHAR_ADVANCE = 9.6;

export const NULL_STATE_LOGO_LINES = [
  "  ___                                   ",
  " /\\_ \\                   __             ",
  " \\//\\ \\   ______  __  __/\\_\\  _____     ",
  "   \\ \\ \\ /\\  __ \\/\\ \\/\\ \\/\\ \\/\\__  \\    ",
  "    \\_\\ \\\\ \\ \\_\\ \\ \\ \\_/ \\ \\ \\/_/  /_   ",
  "    /\\____\\ \\  __/\\ \\___/ \\ \\_\\/\\____\\  ",
  "    \\/____/\\ \\ \\/  \\/__/   \\/_/\\/____/  ",
  "            \\ \\_\\                       ",
  "             \\/_/               v0.1.0",
  "                                        ",
] as const;

export const NULL_STATE_LOGO_VIEWBOX_WIDTH = Math.max(...NULL_STATE_LOGO_LINES.map((line) => line.length)) * NULL_STATE_LOGO_CHAR_ADVANCE;
export const NULL_STATE_LOGO_VIEWBOX_HEIGHT = NULL_STATE_LOGO_LINES.length * NULL_STATE_LOGO_LINE_HEIGHT;
