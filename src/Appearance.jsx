import { memo, useEffect, useRef, useState } from "react";
import { Check, Monitor, Moon, Palette, Sun, X } from "lucide-react";
import { applyAppearance, modes, readAppearance, saveAppearance, themes } from "./appearance";

const modeIcons = { light: Sun, dark: Moon, system: Monitor };

export default memo(function Appearance() {
  const [preference, setPreference] = useState(readAppearance);
  const [open, setOpen] = useState(false);
  const panel = useRef(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const updateSystem = () => {
      if (preference.mode === "system") applyAppearance(preference);
    };
    media.addEventListener("change", updateSystem);
    return () => media.removeEventListener("change", updateSystem);
  }, [preference]);

  useEffect(() => {
    const sync = (event) => {
      if (event.key === "bon-voyage-appearance" || event.key === null) {
        const next = readAppearance();
        applyAppearance(next);
        setPreference(next);
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  function choose(next) {
    const updated = { ...preference, ...next };
    saveAppearance(updated);
    setPreference(updated);
  }

  return (
    <>
      <button className="small-button appearance-trigger" popoverTarget="appearance-panel"
        aria-label="Appearance" aria-expanded={open} aria-controls="appearance-panel">
        <Palette size={17} /><span>Appearance</span>
      </button>
      <div id="appearance-panel" className="appearance-panel" popover="auto" ref={panel}
        role="dialog" aria-labelledby="appearance-title"
        onToggle={(event) => setOpen(event.newState === "open")}>
        <div className="appearance-heading">
          <div><h2 id="appearance-title">Appearance</h2></div>
          <button className="icon-button" aria-label="Close appearance" onClick={() => panel.current.hidePopover()}><X size={17} /></button>
        </div>
        <fieldset className="theme-options">
          <legend>Theme</legend>
          {themes.map((theme) => (
            <label className="theme-option" key={theme.id}>
              <input type="radio" name="workspace-theme" value={theme.id}
                checked={preference.theme === theme.id} onChange={() => choose({ theme: theme.id })} />
              <span className="theme-swatches" aria-hidden="true">
                {theme.colors.map((color) => <i key={color} style={{ background: color }} />)}
              </span>
              <span>{theme.name}</span><Check className="theme-check" size={17} aria-hidden="true" />
            </label>
          ))}
        </fieldset>
        <fieldset className="mode-options">
          <legend>Mode</legend>
          <div className="mode-switch">
            {modes.map((mode) => {
              const Icon = modeIcons[mode];
              return <label className="mode-option" key={mode}>
                <input type="radio" name="workspace-mode" value={mode}
                  checked={preference.mode === mode} onChange={() => choose({ mode })} />
                <Icon size={16} aria-hidden="true" /><span>{mode[0].toUpperCase() + mode.slice(1)}</span>
              </label>;
            })}
          </div>
        </fieldset>
        <small className="appearance-note" role="status">{themes.find((theme) => theme.id === preference.theme).name} · {preference.mode === "system" ? "Follows your device" : `${preference.mode === "dark" ? "Dark" : "Light"} mode`}</small>
      </div>
    </>
  );
});
