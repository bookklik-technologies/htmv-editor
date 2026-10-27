# Commands

Edits go through typed document commands passed to `dispatch(command)`. Command positions and durations use output frames; source in-points use seconds. Unknown or incompatible properties and invalid placements reject the complete transaction.

## Command catalog

| Command | Purpose |
|---|---|
| `patch` | Edit clip properties |
| `move` | Move a clip across tracks or time |
| `trim` | Trim a clip edge |
| `split` | Split a clip at a frame |
| `remove` | Remove clips or tracks |
| `duplicate` | Duplicate clips |
| `group` / `ungroup` | Group selection; dissolve groups |
| `align` | Align or distribute selection |
| `keyframe` / `remove-keyframe` | Add or remove animation keys |
| `preset` | Apply motion presets |
| `transition` | Add a transition at a cut |
| `marker` | Manage chapter markers |

## Examples

```ts
editor.dispatch({
  type: 'keyframe',
  id: clipId,
  property: 'x',
  frame: 15,
  value: 320,
  easing: 'ease-out'
});
editor.dispatch({
  type: 'trim',
  id: clipId,
  edge: 'left',
  delta: 8
});
```

## Transactions

A focused inspector edit or pointer gesture is one undo transaction. The transaction either applies entirely or rejects without partial state. [Undo/redo](/reference/controller-api#methods) covers all applied transactions, retaining up to 100 transactions.

See [Events](/reference/events#change) for how hosts observe resulting document changes.
