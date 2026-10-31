import { memo, useEffect, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { applySidebar, readSidebar, saveSidebar, SIDEBAR_MIN, SIDEBAR_MAX } from "./sidebar";

export default memo(function SidebarControls() {
  const [preference, setPreference] = useState(readSidebar);
  const drag = useRef(null);
  const frame = useRef(null);
  const handle = useRef(null);
  const label = preference.collapsed ? "Expand sidebar" : "Collapse sidebar";

  useEffect(() => () => {
    cancelAnimationFrame(frame.current);
    document.documentElement.classList.remove("sidebar-resizing");
  }, []);

  function choose(next) {
    saveSidebar(next);
    setPreference(next);
  }

  function finish() {
    if (drag.current === null) return;
    cancelAnimationFrame(frame.current);
    choose({ collapsed: false, width: drag.current });
    drag.current = null;
    document.documentElement.classList.remove("sidebar-resizing");
  }

  return <>
    <button className="icon-button sidebar-toggle" onClick={() => choose({ ...preference, collapsed: !preference.collapsed })}
      aria-label={label} title={label} aria-expanded={!preference.collapsed} aria-controls="sidebar-navigation">
      {preference.collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
    </button>
    {!preference.collapsed && <div className="sidebar-resizer" ref={handle} role="separator" tabIndex={0}
      aria-label="Sidebar width" aria-orientation="vertical" aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX} aria-valuenow={preference.width}
      title="Drag to resize. Use arrow keys to adjust, or double-click to reset."
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = preference.width;
        document.documentElement.classList.add("sidebar-resizing");
      }}
      onPointerMove={(event) => {
        if (drag.current === null) return;
        drag.current = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, event.clientX));
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
          if (drag.current === null) return;
          applySidebar({ collapsed: false, width: drag.current });
          handle.current?.setAttribute("aria-valuenow", String(drag.current));
        });
      }}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
      onDoubleClick={() => choose({ collapsed: false, width: SIDEBAR_MIN })}
      onKeyDown={(event) => {
        const widths = { ArrowLeft: preference.width - 16, ArrowRight: preference.width + 16, Home: SIDEBAR_MIN, End: SIDEBAR_MAX };
        if (!(event.key in widths)) return;
        event.preventDefault();
        choose({ collapsed: false, width: Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, widths[event.key])) });
      }} />}
  </>;
});
