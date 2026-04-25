const NULL_STATE_LOGO_FONT_SIZE = 16;
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
  "             \\/_/               v1.0.0",
  "                                        ",
] as const;

export const NULL_STATE_LOGO_VIEWBOX_WIDTH =
  Math.max(...NULL_STATE_LOGO_LINES.map((line) => line.length)) *
  NULL_STATE_LOGO_CHAR_ADVANCE;
export const NULL_STATE_LOGO_VIEWBOX_HEIGHT =
  NULL_STATE_LOGO_LINES.length * NULL_STATE_LOGO_LINE_HEIGHT;

const glyphs = NULL_STATE_LOGO_LINES.flatMap((line, row) =>
  Array.from(line).flatMap((glyph, column) => {
    if (glyph === " ") {
      return [];
    }

    return [
      {
        glyph,
        x: column * NULL_STATE_LOGO_CHAR_ADVANCE,
        y: NULL_STATE_LOGO_FONT_SIZE + row * NULL_STATE_LOGO_LINE_HEIGHT,
      },
    ];
  }),
);

export function NullStateLogo() {
  return (
    <svg
      viewBox={`0 0 ${NULL_STATE_LOGO_VIEWBOX_WIDTH} ${NULL_STATE_LOGO_VIEWBOX_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      className="null-state-logo"
    >
      <g
        fontFamily="JuliaMono, monospace"
        fontSize={NULL_STATE_LOGO_FONT_SIZE}
        fontWeight={300}
        fill="currentColor"
      >
        {glyphs.map(({ glyph, x, y }, index) => (
          <text key={`${index}-${glyph}`} x={x} y={y}>
            {glyph}
          </text>
        ))}
      </g>
    </svg>
  );
}
