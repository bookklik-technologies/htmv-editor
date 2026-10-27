# Keyboard shortcuts

Shortcuts are scoped to each mounted editor instance and do not intercept text inputs.

| Shortcut | Action |
|---|---|
| Space; Left/Right; Shift+Left/Right | Play/pause; step one frame; step ten frames |
| Ctrl/Cmd+Z; Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y | Undo; redo |
| Ctrl/Cmd+A; Ctrl/Cmd+C/X/V/D | Select all; internal clip copy/cut/paste/duplicate |
| Ctrl/Cmd+G; Ctrl/Cmd+Shift+G | Group; ungroup |
| S; Delete/Backspace | Split selected clips at playhead; remove selection |
| Alt+Left/Right; I / O | Move selection by frames; mark range start/end |
| Ctrl/Cmd+S; Escape | Download project archive; cancel pointer interaction/close dialog |

The internal clip clipboard is shared between mounted instances and released when its source instance is destroyed. It does not access the operating-system clipboard.

Headless embedding installs no keyboard handlers; hosts implement their own bindings by dispatching [commands](/reference/commands).
