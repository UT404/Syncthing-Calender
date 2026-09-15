// Minimal type declarations for the parts of the Obsidian API this plugin uses.
// The real `obsidian` package is provided by the app at runtime; this file only
// exists so the project type-checks without the npm package installed.
declare module "obsidian" {
  export interface DomElementInfo {
    cls?: string | string[];
    text?: string;
    attr?: Record<string, string | number | boolean | null>;
    title?: string;
    type?: string;
    value?: string;
    placeholder?: string;
  }

  export class Events {
    on(name: string, cb: (...args: any[]) => any): EventRef;
    off(name: string, cb: (...args: any[]) => any): void;
    trigger(name: string, ...args: any[]): void;
  }
  export interface EventRef {}

  export abstract class TAbstractFile {
    path: string;
    name: string;
    parent: TFolder | null;
    vault: Vault;
  }
  export class TFile extends TAbstractFile {
    basename: string;
    extension: string;
    stat: { mtime: number; ctime: number; size: number };
  }
  export class TFolder extends TAbstractFile {
    children: TAbstractFile[];
    isRoot(): boolean;
  }

  export class Vault extends Events {
    getMarkdownFiles(): TFile[];
    getAbstractFileByPath(path: string): TAbstractFile | null;
    getFolderByPath(path: string): TFolder | null;
    getFileByPath(path: string): TFile | null;
    create(path: string, data: string): Promise<TFile>;
    createFolder(path: string): Promise<TFolder>;
    read(file: TFile): Promise<string>;
    cachedRead(file: TFile): Promise<string>;
    modify(file: TFile, data: string): Promise<void>;
    trash(file: TAbstractFile, system: boolean): Promise<void>;
    delete(file: TAbstractFile, force?: boolean): Promise<void>;
  }

  export interface CachedMetadata {
    frontmatter?: Record<string, any>;
  }
  export class MetadataCache extends Events {
    getFileCache(file: TFile): CachedMetadata | null;
  }
  export class FileManager {
    processFrontMatter(file: TFile, fn: (fm: Record<string, any>) => void): Promise<void>;
    renameFile(file: TAbstractFile, newPath: string): Promise<void>;
    trashFile(file: TAbstractFile): Promise<void>;
  }
  export class Workspace extends Events {
    getLeaf(newLeaf?: boolean | "tab" | "split" | "window"): WorkspaceLeaf;
    getLeavesOfType(type: string): WorkspaceLeaf[];
    getRightLeaf(split: boolean): WorkspaceLeaf | null;
    revealLeaf(leaf: WorkspaceLeaf): Promise<void>;
    detachLeavesOfType(type: string): void;
    onLayoutReady(cb: () => void): void;
  }
  export class WorkspaceLeaf {
    view: View;
    openFile(file: TFile, state?: any): Promise<void>;
    setViewState(state: { type: string; active?: boolean; state?: any }): Promise<void>;
  }
  export class App {
    vault: Vault;
    metadataCache: MetadataCache;
    fileManager: FileManager;
    workspace: Workspace;
  }

  export abstract class Component {
    load(): void;
    unload(): void;
    onload(): void;
    onunload(): void;
    addChild<T extends Component>(c: T): T;
    register(cb: () => any): void;
    registerEvent(ref: EventRef): void;
    registerDomEvent(el: EventTarget, type: string, cb: (evt: any) => any, opts?: any): void;
    registerInterval(id: number): number;
  }
  export class MarkdownRenderChild extends Component {
    containerEl: HTMLElement;
    constructor(containerEl: HTMLElement);
  }
  export interface MarkdownPostProcessorContext {
    sourcePath: string;
    addChild(child: MarkdownRenderChild): void;
  }

  export abstract class View extends Component {
    app: App;
    leaf: WorkspaceLeaf;
    containerEl: HTMLElement;
    abstract getViewType(): string;
    abstract getDisplayText(): string;
    getIcon(): string;
    onOpen(): Promise<void>;
    onClose(): Promise<void>;
  }
  export abstract class ItemView extends View {
    contentEl: HTMLElement;
    constructor(leaf: WorkspaceLeaf);
  }

  export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    dir?: string;
  }
  export abstract class Plugin extends Component {
    app: App;
    manifest: PluginManifest;
    constructor(app: App, manifest: PluginManifest);
    loadData(): Promise<any>;
    saveData(data: any): Promise<void>;
    addRibbonIcon(icon: string, title: string, cb: (evt: MouseEvent) => any): HTMLElement;
    addCommand(cmd: { id: string; name: string; callback?: () => any; icon?: string }): any;
    addSettingTab(tab: PluginSettingTab): void;
    registerView(type: string, factory: (leaf: WorkspaceLeaf) => View): void;
    registerMarkdownCodeBlockProcessor(
      lang: string,
      handler: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => any
    ): void;
  }
  export abstract class PluginSettingTab {
    app: App;
    containerEl: HTMLElement;
    constructor(app: App, plugin: Plugin);
    abstract display(): void;
    hide(): void;
  }
  export class Setting {
    settingEl: HTMLElement;
    constructor(containerEl: HTMLElement);
    setName(name: string): this;
    setDesc(desc: string): this;
    setHeading(): this;
    addText(cb: (t: TextComponent) => any): this;
    addToggle(cb: (t: ToggleComponent) => any): this;
    addDropdown(cb: (d: DropdownComponent) => any): this;
    addButton(cb: (b: ButtonComponent) => any): this;
    addColorPicker(cb: (c: ColorComponent) => any): this;
  }
  export class TextComponent {
    inputEl: HTMLInputElement;
    setValue(v: string): this;
    getValue(): string;
    setPlaceholder(p: string): this;
    onChange(cb: (v: string) => any): this;
  }
  export class ToggleComponent {
    setValue(v: boolean): this;
    getValue(): boolean;
    onChange(cb: (v: boolean) => any): this;
  }
  export class DropdownComponent {
    selectEl: HTMLSelectElement;
    addOption(value: string, display: string): this;
    addOptions(o: Record<string, string>): this;
    setValue(v: string): this;
    getValue(): string;
    onChange(cb: (v: string) => any): this;
  }
  export class ButtonComponent {
    buttonEl: HTMLButtonElement;
    setButtonText(t: string): this;
    setCta(): this;
    setWarning(): this;
    onClick(cb: (evt: MouseEvent) => any): this;
  }
  export class ColorComponent {
    setValue(v: string): this;
    getValue(): string;
    onChange(cb: (v: string) => any): this;
  }
  export class Modal {
    app: App;
    contentEl: HTMLElement;
    modalEl: HTMLElement;
    titleEl: HTMLElement;
    constructor(app: App);
    open(): void;
    close(): void;
    onOpen(): void;
    onClose(): void;
  }
  export class Notice {
    constructor(message: string, timeout?: number);
  }
  export const Platform: { isMobile: boolean; isPhone: boolean; isDesktop: boolean };
  export function normalizePath(path: string): string;
  export function setIcon(el: HTMLElement, icon: string): void;
  export function debounce<T extends (...args: any[]) => any>(fn: T, timeout?: number, resetTimer?: boolean): T;
}

// Obsidian's DOM helpers, added to every element at runtime.
interface Node {
  empty(): void;
}
interface HTMLElement {
  createEl<K extends keyof HTMLElementTagNameMap>(tag: K, o?: import("obsidian").DomElementInfo | string): HTMLElementTagNameMap[K];
  createDiv(o?: import("obsidian").DomElementInfo | string): HTMLDivElement;
  createSpan(o?: import("obsidian").DomElementInfo | string): HTMLSpanElement;
  setText(t: string): void;
  addClass(...cls: string[]): void;
  removeClass(...cls: string[]): void;
  toggleClass(cls: string, on: boolean): void;
  hasClass(cls: string): boolean;
  empty(): void;
}
