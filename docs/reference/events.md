# Events

Hosts receive state through an `onEvent` callback passed to `createEditor` or `createHeadlessEditor`. Callbacks must be synchronous; use events to update host state rather than mutating the editor reentrantly.

```ts
const editor = createHeadlessEditor({
  project: createProject('Demo'),
  onEvent(event) {
    switch (event.type) {
      case 'change': /* event.project */ break;
      case 'selection': /* selected ids */ break;
      case 'playback': /* state */ break;
      case 'diagnostic': /* severity, code, operation */ break;
      case 'save': /* status, message */ break;
      case 'export': /* progress, cancellation */ break;
    }
  }
});
```

## Event types

| Event | Carries | Notes |
|---|---|---|
| `change` | `project` | Emitted after each committed transaction |
| `selection` | All selected IDs | Includes every selected ID |
| `playback` | Playback state | Play, pause, and seek transitions |
| `diagnostic` | `severity`, `code`, `operation` | Preview diagnostics and validation problems arrive here too |
| `save` | `status`, `message` | Includes error and conflict statuses |
| `export` | Progress, cancellation | Emitted during video export |
| `appearance` | `preference`, resolved mode | Light/dark resolution from the appearance preference |

## Semantics

- `ready` means initialization finished; observe diagnostics for preview availability.
- An `appearance` event contains both the preference and the resolved `'light' | 'dark'` value.
- Export events report progress and cancellation of the current export only.
- Save events surface errors and conflicts raised by the revision compare-and-swap.
