export type ClipKind = 'video' | 'image' | 'text' | 'audio' | 'shape' | 'caption';
export type AssetKind = 'video' | 'image' | 'audio' | 'font';
export type MotionProperty = 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity' | 'color' | 'background' | 'gain';
export interface MotionKeyframe { id: string; frame: number; value: number | string; easing: string }
export interface MotionChannel { property: MotionProperty; keyframes: MotionKeyframe[] }
export interface EditorAsset { id: string; name: string; kind: AssetKind; mimeType: string; size: number; duration: number; width: number; height: number; hasAudio: boolean; family?: string }
export interface ClipBase { id: string; name: string; trackId: string; start: number; duration: number; animationOffset?: number; animations?: MotionChannel[]; groupId?: string; fadeOffset?: number; fadeDuration?: number }
export interface VisualProperties { x: number; y: number; width: number; height: number; opacity: number; rotation?: number; scaleX?: number; scaleY?: number }
export interface VideoClip extends ClipBase, VisualProperties { kind: 'video'; assetId: string; sourceIn: number; fit: 'cover' | 'contain' | 'fill'; gain: number; muted: boolean; fadeIn?: number; fadeOut?: number }
export interface ImageClip extends ClipBase, VisualProperties { kind: 'image'; assetId: string; fit: 'cover' | 'contain' | 'fill' }
export interface TextStyle extends VisualProperties { text: string; fontSize: number; fontFamily: string; fontWeight: '400' | '700'; color: string; align: 'left' | 'center' | 'right'; lineHeight?: number; decoration?: 'none' | 'underline' | 'line-through'; background?: string }
export interface TextClip extends ClipBase, TextStyle { kind: 'text' }
export interface CaptionClip extends ClipBase, TextStyle { kind: 'caption' }
export interface ShapeClip extends ClipBase, VisualProperties { kind: 'shape'; shape: 'rectangle' | 'ellipse' | 'line'; fill: string; stroke: string; strokeWidth: number; radius: number }
export interface AudioClip extends ClipBase { kind: 'audio'; assetId: string; sourceIn: number; gain: number; muted: boolean; fadeIn?: number; fadeOut?: number }
export type EditorClip = VideoClip | ImageClip | TextClip | CaptionClip | ShapeClip | AudioClip;
export type VisualClip = Exclude<EditorClip, AudioClip>;
/** First visual track paints on top. */
export interface EditorTrack { id: string; name: string; kind: 'visual' | 'audio' | 'caption'; hidden?: boolean; locked?: boolean; muted?: boolean; solo?: boolean }
export interface EditorTransition { id: string; outgoingId: string; incomingId: string; duration: number; type: 'crossfade' | 'slide' | 'wipe'; direction: 'left' | 'right' | 'up' | 'down' }
export interface EditorMarker { id: string; frame: number; name: string }
export interface EditorGroup { id: string; name: string }
export interface EditorProject {
  version: 2; id: string; name: string; width: number; height: number; fps: number; duration: number; background: string;
  tracks: EditorTrack[]; clips: EditorClip[]; assets: EditorAsset[]; transitions: EditorTransition[]; markers: EditorMarker[]; groups: EditorGroup[];
  range?: { from: number; toExclusive: number };
}
export interface LegacyEditorProject extends Omit<EditorProject, 'version' | 'transitions' | 'markers' | 'groups'> { version: 1 }
export type EditorProjectInput = EditorProject | LegacyEditorProject;
export type EditorAssets = Record<string, Blob>;
export interface ProjectBundle { project: EditorProject; assets: EditorAssets }
export type EditorCommand =
  | { type: 'patch'; ids: string[]; changes: Record<string, unknown> }
  | { type: 'move'; ids: string[]; delta: number; trackId?: string }
  | { type: 'trim'; id: string; edge: 'left' | 'right'; delta: number }
  | { type: 'split'; ids: string[]; frame: number }
  | { type: 'remove'; ids: string[] }
  | { type: 'duplicate'; ids: string[]; at?: number }
  | { type: 'group'; ids: string[] }
  | { type: 'ungroup'; ids: string[] }
  | { type: 'align'; ids: string[]; mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distribute-x' | 'distribute-y' }
  | { type: 'keyframe'; id: string; property: MotionProperty; frame: number; value: number | string; easing?: string }
  | { type: 'remove-keyframe'; id: string; property: MotionProperty; keyframeId: string }
  | { type: 'preset'; ids: string[]; preset: 'fade' | 'slide' | 'scale' | 'rise' }
  | { type: 'transition'; outgoingId: string; incomingId: string; duration: number; transition: EditorTransition['type']; direction?: EditorTransition['direction'] }
  | { type: 'marker'; frame: number; name: string };
export interface EditorFrameNode { id: string; x: number; y: number; width: number; height: number; rotation: number; scaleX: number; scaleY: number; opacity: number; corners: { x: number; y: number }[]; values: Record<string, number | string> }
export interface EditorFrameTransition { type: string; direction: string; progress: number; outgoingId: string | null; incomingId: string }
export interface EditorFrameState { frame: number; revisionHash: string; nodes: EditorFrameNode[]; transitions?: EditorFrameTransition[] }
export interface EditorTemplate { id: string; name: string; description: string; builtin: boolean }
export type EditorAppearance = 'system' | 'light' | 'dark';
export interface EditorAppearanceState { preference: EditorAppearance; resolved: 'light' | 'dark' }
export type EditorEvent =
  | ({ type: 'appearance' } & EditorAppearanceState)
  | { type: 'change'; project: EditorProject }
  | { type: 'selection'; clipId: string | null; clipIds: string[] }
  | { type: 'playback'; frame: number; playing: boolean }
  | { type: 'diagnostic'; message: string; severity: 'error' | 'warning'; code?: string; operation?: string }
  | { type: 'save'; status: 'saving' | 'saved' | 'error' | 'disabled' | 'conflict'; message: string }
  | { type: 'export'; phase: string; completedFrames: number; totalFrames: number };
export interface EditorOptions { project?: EditorProjectInput; assets?: EditorAssets; autosave?: boolean; storageKey?: string; appearance?: EditorAppearance; onEvent?: (event: EditorEvent) => void }
export interface VideoExportOptions { profile?: 'mp4' | 'webm' | 'auto'; allowUnverifiedAudio?: boolean; signal?: AbortSignal; range?: { from: number; toExclusive: number }; width?: number; height?: number; videoBitrate?: number; audioBitrate?: number }
export type EditorOutputTarget = { kind: 'memory'; maxBytes?: number } | { kind: 'file'; handle: FileSystemFileHandle } | { kind: 'opfs'; name?: string };
export interface VideoExportResult { blob: Blob; extension: string; manifest: Record<string, unknown> }
export interface ExportPreflight { supported: boolean; estimatedBytes: number; diagnostics: string[]; extension?: string }
export type TargetExportResult =
  | ({ kind: 'blob' } & VideoExportResult)
  | { kind: 'file'; bytesWritten: number; extension: string; manifest: Record<string, unknown> }
  | { kind: 'opfs'; file: File; cleanup: () => Promise<void>; extension: string; manifest: Record<string, unknown> };
export interface EditorController {
  readonly ready: Promise<void>;
  readonly hasUnsavedChanges: boolean;
  getAppearance(): EditorAppearance;
  setAppearance(appearance: EditorAppearance): void;
  flushSave(): Promise<void>;
  getPerformanceMetrics(): { samples: number; pointerFeedbackP95Ms: number };
  getProject(): EditorProject; getAssets(): EditorAssets;
  loadProject(project: EditorProjectInput, assets: EditorAssets, options?: { discardUnsaved?: boolean }): Promise<void>;
  importFiles(files: Iterable<File>): Promise<void>;
  updateProject(update: (draft: EditorProject) => void): void; dispatch(command: EditorCommand): void;
  getSelection(): string[]; setSelection(ids: string[]): void; inspectFrame(frame?: number): EditorFrameState;
  undo(): void; redo(): void; play(): Promise<void>; pause(): void; seek(frame: number): Promise<void>;
  saveArchive(): Promise<Blob>; openArchive(file: Blob, options?: { discardUnsaved?: boolean }): Promise<void>;
  listTemplates(): Promise<EditorTemplate[]>; saveTemplate(name: string): Promise<void>; loadTemplate(id: string, options?: { discardUnsaved?: boolean }): Promise<void>;
  importSubtitles(file: Blob, format?: 'srt' | 'vtt'): Promise<void>; exportSubtitles(format?: 'srt' | 'vtt'): Blob;
  exportStill(frame?: number): Promise<Blob>;
  preflightExport(options?: VideoExportOptions): Promise<ExportPreflight>;
  exportVideo(options?: VideoExportOptions): Promise<VideoExportResult>;
  exportToTarget(target: EditorOutputTarget, options?: VideoExportOptions): Promise<TargetExportResult>;
  destroy(): Promise<void>;
}
