import {
  NULL_STATE_LOGO_CHAR_ADVANCE,
  NULL_STATE_LOGO_FONT_SIZE,
  NULL_STATE_LOGO_LINES,
  NULL_STATE_LOGO_LINE_HEIGHT,
  NULL_STATE_LOGO_VIEWBOX_HEIGHT,
  NULL_STATE_LOGO_VIEWBOX_WIDTH,
} from "./logo.constants";

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
