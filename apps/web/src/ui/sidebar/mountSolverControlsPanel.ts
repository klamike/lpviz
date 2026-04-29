import type { AppContext } from "@/app/appContext";
import { selectSolverControlsUiState } from "@/features/core/selectors";
import {
  getState,
  subscribe,
  type SolverMode,
  type SolverSettings,
  type State,
} from "@/features/core/store";
import { el } from "@/ui/dom";

const MAXIT_LOG_MIN = 0,
  MAXIT_LOG_MAX = 5,
  MAXIT_LOG_STEP = 0.01;
const maxitToSliderValue = (value: number) =>
  Math.min(
    MAXIT_LOG_MAX,
    Math.max(MAXIT_LOG_MIN, Math.log10(Math.max(1, value))),
  );
const sliderValueToMaxit = (value: string) =>
  Math.max(1, Math.round(10 ** parseFloat(value)));
const fmt = (value: number) => new Intl.NumberFormat("en-US").format(value);

type MaxitSettingKey = Extract<keyof SolverSettings, "maxitIPM" | "maxitPDHG">;
function range(
  id: string,
  min: string,
  max: string,
  step: string,
  onInput: (v: string) => void,
) {
  const i = el("input", {
    attrs: { type: "range", id, min, max, step, autocomplete: "off" },
  });
  i.addEventListener("input", () => onInput((i as HTMLInputElement).value));
  return i as HTMLInputElement;
}
function checkbox(id: string, onChange: (v: boolean) => void) {
  const i = el("input", {
    attrs: { type: "checkbox", id },
  }) as HTMLInputElement;
  i.addEventListener("change", () => onChange(i.checked));
  return i;
}
function labeled(
  text: string,
  id: string,
  control: HTMLElement,
  value?: HTMLElement,
) {
  const wrap = el("div");
  const label = el("label", { attrs: { for: id } });
  label.append(text, value ?? el("span"));
  wrap.append(label, control);
  return wrap;
}

export function mountSolverControlsPanel(parent: HTMLElement, ctx: AppContext) {
  const root = el("div", { className: "controlPanel" });
  parent.append(root);
  const buttonGroup = el("div", { className: "button-group" });
  root.append(buttonGroup);
  const buttons = new Map<SolverMode, HTMLButtonElement>();
  const mkButton = (mode: SolverMode, text: string, id?: string) => {
    const b = el("button", { id, text });
    b.addEventListener("click", () => ctx.actions.setActiveSolverMode(mode));
    buttons.set(mode, b);
    buttonGroup.append(b);
  };
  mkButton("ipm", "IPM", "ipmButton");
  mkButton("pdhg", "PDHG");
  mkButton("simplex", "Simplex");
  mkButton("central", "Central Path", "iteratePathButton");
  const settings = el("div");
  root.append(settings);
  function renderMaxit(
    id: string,
    value: number,
    key: MaxitSettingKey,
    mode: SolverMode,
  ) {
    const span = el("span", { text: fmt(value) });
    const input = range(
      id,
      String(MAXIT_LOG_MIN),
      String(MAXIT_LOG_MAX),
      String(MAXIT_LOG_STEP),
      (v) => {
        ctx.actions.updateSolverSetting(key, sliderValueToMaxit(v));
        ctx.actions.recomputeIfModeActive(mode);
      },
    );
    input.value = String(maxitToSliderValue(value));
    const wrap = el("div", { className: "log-slider-control" });
    const label = el("label", {
      attrs: { for: id },
      text: "Maximum iterations:",
    });
    label.append(span);
    wrap.append(
      label,
      input,
      el("div", { className: "log-slider-scale" }, [
        el("span", { text: "1" }),
        el("span", { text: "10" }),
        el("span", { text: "100" }),
        el("span", { text: "1k" }),
        el("span", { text: "10k" }),
        el("span", { text: "100k" }),
      ]),
    );
    return wrap;
  }
  function render(s: State) {
    const ui = selectSolverControlsUiState(s);
    for (const mode of ["ipm", "pdhg", "simplex", "central"] as SolverMode[]) {
      const b = buttons.get(mode)!;
      b.className = ui.buttons[mode].active ? "button-active" : "";
      b.disabled = ui.buttons[mode].disabled;
    }
    settings.replaceChildren();
    const sec = el("div", { className: "settings-section is-block" });
    settings.append(sec);
    const st = s.solverSettings;
    if (ui.activeMode === "ipm") {
      const v1 = el("span", { text: st.alphaMax.toFixed(3) });
      const a = range("alphaMaxSlider", "0.001", "1", "0.001", (v) => {
        ctx.actions.updateSolverSetting("alphaMax", parseFloat(v));
        ctx.actions.recomputeIfModeActive("ipm");
      });
      a.value = String(st.alphaMax);
      sec.append(
        labeled("αmax (maximum step size ratio):", "alphaMaxSlider", a, v1),
      );
      const v2 = el("span", { text: st.correctorThreshold.toFixed(3) });
      const c = range(
        "correctorThresholdSlider",
        "0.001",
        "0.999",
        "0.001",
        (v) => {
          ctx.actions.updateSolverSetting("correctorThreshold", parseFloat(v));
          ctx.actions.recomputeIfModeActive("ipm");
        },
      );
      c.value = String(st.correctorThreshold);
      sec.append(
        labeled("Corrector threshold:", "correctorThresholdSlider", c, v2),
        renderMaxit("maxitSliderIPM", st.maxitIPM, "maxitIPM", "ipm"),
      );
    }
    if (ui.activeMode === "pdhg") {
      const eta = range("pdhgEtaSlider", "0.001", "0.750", "0.001", (v) => {
        ctx.actions.updateSolverSetting("pdhgEta", parseFloat(v));
        ctx.actions.recomputeIfModeActive("pdhg");
      });
      eta.value = String(st.pdhgEta);
      sec.append(
        labeled(
          "η (primal step size factor):",
          "pdhgEtaSlider",
          eta,
          el("span", { text: st.pdhgEta.toFixed(3) }),
        ),
      );
      const tau = range("pdhgTauSlider", "0.001", "0.750", "0.001", (v) => {
        ctx.actions.updateSolverSetting("pdhgTau", parseFloat(v));
        ctx.actions.recomputeIfModeActive("pdhg");
      });
      tau.value = String(st.pdhgTau);
      sec.append(
        labeled(
          "τ (dual step size factor):",
          "pdhgTauSlider",
          tau,
          el("span", { text: st.pdhgTau.toFixed(3) }),
        ),
        renderMaxit("maxitSliderPDHG", st.maxitPDHG, "maxitPDHG", "pdhg"),
      );
      const row = el("div", { className: "settings-checkbox-row" });
      (
        [
          ["pdhgIneqMode", "Inequality mode"],
          ["pdhgHalpernMode", "Halpern"],
          ["pdhgColorByBasis", "Color by basis"],
        ] as const
      ).forEach(([key, label]) => {
        const cb = checkbox(key, (v) => {
          ctx.actions.updateSolverSetting(key, v);
          ctx.actions.recomputeIfModeActive("pdhg");
        });
        cb.checked = st[key];
        row.append(
          el("label", { attrs: { for: key }, text: label + " " }, [cb]),
        );
      });
      sec.append(row);
    }
    if (ui.activeMode === "central") {
      const n = range("centralPathIterSlider", "2", "100", "1", (v) => {
        ctx.actions.updateSolverSetting("centralPathIter", parseInt(v, 10));
        ctx.actions.recomputeIfModeActive("central");
      });
      n.value = String(st.centralPathIter);
      sec.append(
        labeled(
          " N (number of steps): ",
          "centralPathIterSlider",
          n,
          el("span", { text: String(st.centralPathIter) }),
        ),
      );
    }
  }
  render(getState());
  const unsub = subscribe(render);
  return {
    destroy: () => {
      unsub();
      root.remove();
    },
  };
}
