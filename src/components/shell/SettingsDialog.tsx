"use client";

import { useState, useEffect } from "react";
import { useAppStore, getEngine } from "@/lib/app/store";
import { chordToString, parseChord } from "@/lib/registries/shortcut-registry";
import type { ThemeColors } from "@/lib/registries/theme-registry";

/**
 * Settings dialog — every value is backed by a user-modifiable registry:
 *   - Themes → ThemeRegistry (switch + per-token editor)
 *   - Shortcuts → ShortcutRegistry (rebind / clear)
 *   - Settings → ConfigStore (peek modifiers, drag hints, min sizes, etc.)
 *
 * The dialog reads/writes through the registries directly; changes apply live.
 */
export function SettingsDialog() {
  const open = useAppStore((s) => s.settingsOpen);
  const setOpen = useAppStore((s) => s.setSettingsOpen);
  const { registries } = getEngine();
  const [tab, setTab] = useState<"appearance" | "shortcuts" | "behavior">("appearance");

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 94vw)",
          maxHeight: "82vh",
          background: "var(--dock-card)",
          border: "1px solid var(--dock-border)",
          borderRadius: "var(--dock-radius)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          color: "var(--dock-fg)",
          fontFamily: "var(--dock-font)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--dock-border)" }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Settings</span>
          <button className="cmd-btn danger" style={{ marginLeft: "auto" }} onClick={() => setOpen(false)}>✕</button>
        </div>
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div style={{ width: 160, borderRight: "1px solid var(--dock-border)", padding: 8, flex: "0 0 auto" }}>
            {([
              ["appearance", "Appearance"],
              ["shortcuts", "Shortcuts"],
              ["behavior", "Behavior"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: tab === id ? "var(--dock-bg-muted)" : "transparent",
                  border: "none",
                  color: tab === id ? "var(--dock-fg)" : "var(--dock-fg-muted)",
                  cursor: "pointer",
                  fontSize: 12,
                  marginBottom: 2,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 18 }}>
            {tab === "appearance" && <AppearanceTab />}
            {tab === "shortcuts" && <ShortcutsTab />}
            {tab === "behavior" && <BehaviorTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

function AppearanceTab() {
  const { registries } = getEngine();
  const [, force] = useState(0);
  const themes = registries.themes.all();
  const active = registries.themes.active;
  const colors = registries.themes.effectiveColors;
  const hasOverrides = registries.themes.hasOverrides();

  const colorKeys: { key: keyof ThemeColors; label: string; type: "color" | "number" }[] = [
    { key: "background", label: "Background", type: "color" },
    { key: "backgroundAlt", label: "Background (alt)", type: "color" },
    { key: "backgroundMuted", label: "Background (muted)", type: "color" },
    { key: "foreground", label: "Foreground", type: "color" },
    { key: "foregroundMuted", label: "Foreground (muted)", type: "color" },
    { key: "border", label: "Border", type: "color" },
    { key: "card", label: "Card", type: "color" },
    { key: "accentInsert", label: "Accent: Insert (green)", type: "color" },
    { key: "accentTab", label: "Accent: Tab (blue)", type: "color" },
    { key: "accentEmbed", label: "Accent: Embed (orange)", type: "color" },
    { key: "dotChart", label: "Dot: Chart", type: "color" },
    { key: "dotTable", label: "Dot: Table", type: "color" },
    { key: "dotText", label: "Dot: Text", type: "color" },
    { key: "dotImage", label: "Dot: Image", type: "color" },
    { key: "splitterWidth", label: "Splitter width (px)", type: "number" },
    { key: "radius", label: "Radius (px)", type: "number" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--dock-fg-muted)", marginBottom: 6 }}>Theme</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                registries.themes.set_active(t.id);
                registries.settings.set("ui.theme_id", t.id);
                registries.applyThemeToDocument();
                force((n) => n + 1);
              }}
              style={{
                padding: 10,
                borderRadius: 8,
                border: `1px solid ${t.id === active.id ? "var(--dock-ci)" : "var(--dock-border)"}`,
                background: "var(--dock-bg-alt)",
                cursor: "pointer",
                textAlign: "left",
                color: "var(--dock-fg)",
              }}
            >
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: t.colors.background, border: "1px solid var(--dock-border)" }} />
                <span style={{ width: 12, height: 12, borderRadius: 3, background: t.colors.accentInsert }} />
                <span style={{ width: 12, height: 12, borderRadius: 3, background: t.colors.accentTab }} />
                <span style={{ width: 12, height: 12, borderRadius: 3, background: t.colors.accentEmbed }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{t.name}</div>
              <div style={{ fontSize: 10, color: "var(--dock-fg-muted)" }}>{t.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--dock-fg-muted)", marginBottom: 6, marginTop: 14 }}>
        Tokens {hasOverrides && <span style={{ color: "var(--dock-ce)" }}>(edited)</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {colorKeys.map(({ key, label, type }) => (
          <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
            <span style={{ flex: 1, color: "var(--dock-fg-muted)" }}>{label}</span>
            {type === "color" ? (
              <input
                type="color"
                value={colors[key] as string}
                onChange={(e) => {
                  registries.themes.setToken(key, e.target.value as never);
                  registries.applyThemeToDocument();
                  force((n) => n + 1);
                }}
                style={{ width: 32, height: 24, border: "1px solid var(--dock-border)", borderRadius: 4, background: "transparent", cursor: "pointer" }}
              />
            ) : (
              <input
                type="number"
                value={colors[key] as number}
                onChange={(e) => {
                  registries.themes.setToken(key, Number(e.target.value) as never);
                  registries.applyThemeToDocument();
                  force((n) => n + 1);
                }}
                style={{ width: 60, background: "var(--dock-bg)", border: "1px solid var(--dock-border)", borderRadius: 4, color: "var(--dock-fg)", padding: "2px 6px", fontSize: 11 }}
              />
            )}
          </label>
        ))}
      </div>
      {hasOverrides && (
        <button
          onClick={() => {
            registries.themes.resetOverrides();
            registries.applyThemeToDocument();
            force((n) => n + 1);
          }}
          style={{ marginTop: 14, padding: "6px 12px", borderRadius: 6, border: "1px solid var(--dock-border)", background: "var(--dock-bg-muted)", color: "var(--dock-fg)", cursor: "pointer", fontSize: 12 }}
        >
          Reset tokens to theme defaults
        </button>
      )}
    </div>
  );
}

function ShortcutsTab() {
  const { registries } = getEngine();
  const [, force] = useState(0);
  const [capturing, setCapturing] = useState<string | null>(null);
  const commands = registries.commands.all();

  const captureKey = (commandId: string) => {
    setCapturing(commandId);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(null);
        window.removeEventListener("keydown", onKey, true);
        return;
      }
      const chord = parseChord(
        [
          e.ctrlKey ? "Ctrl" : "",
          e.metaKey ? "Cmd" : "",
          e.altKey ? "Alt" : "",
          e.shiftKey ? "Shift" : "",
          e.key.toLowerCase(),
        ].filter(Boolean).join("+"),
      );
      // unbind any existing command on that chord, then bind
      const existing = registries.shortcuts.lookup(chord);
      if (existing && existing !== commandId) {
        registries.shortcuts.unbind(chord);
      }
      registries.shortcuts.unbindCommand(commandId);
      registries.shortcuts.bind(chord, commandId);
      setCapturing(null);
      force((n) => n + 1);
      window.removeEventListener("keydown", onKey, true);
    };
    window.addEventListener("keydown", onKey, true);
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--dock-fg-muted)", marginBottom: 10 }}>
        Click a binding, then press the new key combination. Press <kbd>Esc</kbd> to cancel. Bindings are user-modifiable and persist for the session.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {commands.map((def) => {
          const bindings = registries.shortcuts.bindingsFor(def.id);
          return (
            <div
              key={def.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--dock-border)",
                background: "var(--dock-bg-alt)",
                fontSize: 12,
              }}
            >
              <span style={{ flex: 1 }}>
                <div style={{ color: "var(--dock-fg)" }}>{def.name}</div>
                <div style={{ fontSize: 10, color: "var(--dock-fg-muted)" }}>{def.id}</div>
              </span>
              {bindings.length > 0 ? (
                bindings.map((b) => (
                  <kbd
                    key={chordToString(b.chord)}
                    style={{ fontSize: 10, color: "var(--dock-fg)", border: "1px solid var(--dock-border)", borderRadius: 4, padding: "3px 7px", background: "var(--dock-bg)" }}
                  >
                    {chordToString(b.chord)}
                  </kbd>
                ))
              ) : (
                <span style={{ fontSize: 10, color: "var(--dock-fg-muted)", fontStyle: "italic" }}>unbound</span>
              )}
              <button
                onClick={() => captureKey(def.id)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 5,
                  border: "1px solid var(--dock-border)",
                  background: capturing === def.id ? "var(--dock-ci)" : "var(--dock-bg-muted)",
                  color: capturing === def.id ? "#000" : "var(--dock-fg)",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                {capturing === def.id ? "Press keys…" : "Rebind"}
              </button>
              {bindings.length > 0 && (
                <button
                  onClick={() => {
                    registries.shortcuts.unbindCommand(def.id);
                    force((n) => n + 1);
                  }}
                  style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid var(--dock-border)", background: "transparent", color: "var(--dock-fg-muted)", cursor: "pointer", fontSize: 11 }}
                >
                  Clear
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BehaviorTab() {
  const { registries, engine } = getEngine();
  const [, force] = useState(0);
  const settings = registries.settings;
  const snapshot = settings.snapshot();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Field label="Peek modifier (panel header)" help="Modifier to reveal panel headers on hover">
        <select
          value={settings.get("ui.peek_modifier_panel", "ctrl")}
          onChange={(e) => { settings.set("ui.peek_modifier_panel", e.target.value); force((n) => n + 1); }}
          style={selectStyle}
        >
          <option value="ctrl">Ctrl</option>
          <option value="shift">Shift</option>
          <option value="alt">Alt</option>
          <option value="meta">Cmd</option>
        </select>
      </Field>
      <Field label="Peek modifier (group header)" help="Modifier to reveal container/tabs/embed headers">
        <select
          value={settings.get("ui.peek_modifier_group", "shift")}
          onChange={(e) => { settings.set("ui.peek_modifier_group", e.target.value); force((n) => n + 1); }}
          style={selectStyle}
        >
          <option value="ctrl">Ctrl</option>
          <option value="shift">Shift</option>
          <option value="alt">Alt</option>
          <option value="meta">Cmd</option>
        </select>
      </Field>
      <ToggleField
        label="Show drag-mode hint badge"
        value={settings.get("ui.drag_hints", true)}
        onChange={(v) => { settings.set("ui.drag_hints", v); force((n) => n + 1); }}
      />
      <ToggleField
        label="Show connection dots at splitter junctions"
        value={settings.get("ui.show_connection_dots", true)}
        onChange={(v) => { settings.set("ui.show_connection_dots", v); force((n) => n + 1); }}
      />
      <ToggleField
        label="Show dev tree-view panel"
        value={settings.get("ui.show_dev_panel", true)}
        onChange={(v) => { settings.set("ui.show_dev_panel", v); engine.eventBus.publish({ type: "app.settings.changed" }); force((n) => n + 1); }}
      />
      <Field label="Animation duration (ms)" help="0 disables transitions">
        <input
          type="number"
          value={settings.get("ui.animation_duration", 120)}
          onChange={(e) => { settings.set("ui.animation_duration", e.target.value); registries.applyThemeToDocument(); force((n) => n + 1); }}
          style={inputStyle}
        />
      </Field>
      <Field label="Min panel width (px)">
        <input type="number" value={settings.get("ui.min_panel_width", 60)} onChange={(e) => { settings.set("ui.min_panel_width", e.target.value); force((n) => n + 1); }} style={inputStyle} />
      </Field>
      <Field label="Min floating panel width (px)">
        <input type="number" value={settings.get("ui.float_min_width", 140)} onChange={(e) => { settings.set("ui.float_min_width", e.target.value); force((n) => n + 1); }} style={inputStyle} />
      </Field>
      <Field label="Min floating panel height (px)">
        <input type="number" value={settings.get("ui.float_min_height", 80)} onChange={(e) => { settings.set("ui.float_min_height", e.target.value); force((n) => n + 1); }} style={inputStyle} />
      </Field>
      <Field label="Min embed zone size (px)">
        <input type="number" value={settings.get("ui.embed_zone_min", 80)} onChange={(e) => { settings.set("ui.embed_zone_min", e.target.value); force((n) => n + 1); }} style={inputStyle} />
      </Field>
      <Field label="Embed padding (px)" help="Padding around embedded docks (between the embed border and its zones/floats)">
        <input type="number" value={settings.get("ui.embed_padding", 0)} onChange={(e) => { settings.set("ui.embed_padding", e.target.value); engine.eventBus.publish({ type: "app.settings.changed" }); force((n) => n + 1); }} style={inputStyle} />
      </Field>
      <Field label="Font family">
        <input type="text" value={settings.get("ui.font_family", "ui-sans-serif, system-ui, sans-serif")} onChange={(e) => { settings.set("ui.font_family", e.target.value); registries.applyThemeToDocument(); force((n) => n + 1); }} style={{ ...inputStyle, width: "100%" }} />
      </Field>
      <div style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--dock-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "var(--dock-fg-muted)" }}>{Object.keys(snapshot).length} settings persisted to localStorage</span>
        <button
          onClick={() => { settings.reset(); registries.applyThemeToDocument(); force((n) => n + 1); }}
          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--dock-border)", background: "var(--dock-bg-muted)", color: "var(--dock-fg)", cursor: "pointer", fontSize: 12 }}
        >
          Reset all to defaults
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: 100,
  background: "var(--dock-bg)",
  border: "1px solid var(--dock-border)",
  borderRadius: 4,
  color: "var(--dock-fg)",
  padding: "3px 8px",
  fontSize: 12,
  fontFamily: "var(--dock-font)",
};
const selectStyle: React.CSSProperties = { ...inputStyle, width: 120 };

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
      <span style={{ flex: 1 }}>
        <div style={{ color: "var(--dock-fg)" }}>{label}</div>
        {help && <div style={{ fontSize: 10, color: "var(--dock-fg-muted)" }}>{help}</div>}
      </span>
      {children}
    </label>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
      <span style={{ flex: 1, color: "var(--dock-fg)" }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 40, height: 22, borderRadius: 999, border: "1px solid var(--dock-border)",
          background: value ? "var(--dock-ci)" : "var(--dock-bg-muted)",
          position: "relative", cursor: "pointer", transition: "background 150ms",
        }}
      >
        <span
          style={{
            position: "absolute", top: 2, left: value ? 20 : 2, width: 16, height: 16, borderRadius: "50%",
            background: "#fff", transition: "left 150ms",
          }}
        />
      </button>
    </label>
  );
}
