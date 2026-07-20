// Minimal stand-in for the "obsidian" module so the plugin can be smoke-tested
// under plain Node (see tools/plugin-smoke.test.js). Only what main.js touches.
"use strict";

class TFile {}
class TFolder {}

const el = () => {
  const e = {
    setText() {}, empty() {}, addClass() {},
    createDiv() { return el(); },
    createEl() { return el(); },
  };
  return e;
};

class Modal {
  constructor(app) { this.app = app; this.titleEl = el(); this.contentEl = el(); }
  open() {} close() {}
}
class ItemView { constructor(leaf) { this.leaf = leaf; this.contentEl = el(); } }
class Plugin {
  constructor() { this.settings = {}; }
  registerView() {} addRibbonIcon() {} addCommand() {} addSettingTab() {}
  registerEvent() {} loadData() { return Promise.resolve({}); } saveData() { return Promise.resolve(); }
}
class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = el(); } }
class Setting {
  constructor() {}
  setName() { return this; } setDesc() { return this; } setHeading() { return this; }
  addButton(cb) { cb && cb(this); return this; }
  addToggle(cb) { cb && cb(this); return this; }
  addText(cb) { cb && cb(this); return this; }
  setButtonText() { return this; } setCta() { return this; } setDisabled() { return this; }
  setValue() { return this; } setPlaceholder() { return this; } onChange() { return this; } onClick() { return this; }
}
class Notice { constructor() {} setMessage() {} hide() {} }

const normalizePath = (p) => String(p || "").replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");

// Tests install a handler: require("obsidian").__setRequestHandler(url => ({json,text}))
let handler = () => { throw new Error("requestUrl: no test handler installed"); };
const requestUrl = async ({ url }) => handler(url);
const __setRequestHandler = (h) => { handler = h; };

/* ── fake vault ──────────────────────────────────────────────────────── */
class FakeVault {
  constructor() {
    this.docs = new Map();     // path → content
    this.folders = new Map();  // path → TFolder (with .name/.path/.children)
    this._root = this._folder("");
  }
  _folder(path) {
    if (this.folders.has(path)) return this.folders.get(path);
    const f = new TFolder();
    f.path = path;
    f.name = path.split("/").pop() || "/";
    f.children = [];
    this.folders.set(path, f);
    if (path) {
      const parent = this._folder(path.split("/").slice(0, -1).join("/"));
      parent.children.push(f);
    }
    return f;
  }
  _file(path, content) {
    path = normalizePath(path);
    const existed = this.docs.has(path);
    this.docs.set(path, content);
    if (!existed) {
      const f = new TFile();
      f.path = path;
      f.name = path.split("/").pop();
      f.basename = f.name.replace(/\.[^.]+$/, "");
      f.extension = (f.name.match(/\.([^.]+)$/) || [, ""])[1];
      f.stat = { size: content.length };
      this.folders.set("__file:" + path, f);
      const parent = this._folder(path.split("/").slice(0, -1).join("/"));
      parent.children.push(f);
    }
  }
  getAbstractFileByPath(p) {
    p = normalizePath(p);
    return this.folders.get("__file:" + p) || this.folders.get(p) || null;
  }
  getMarkdownFiles() {
    return [...this.docs.keys()].filter((p) => p.endsWith(".md"))
      .map((p) => this.getAbstractFileByPath(p));
  }
  getFiles() { return [...this.docs.keys()].map((p) => this.getAbstractFileByPath(p)); }
  async cachedRead(f) { return this.docs.get(f.path); }
  async readBinary(f) { return Buffer.from(this.docs.get(f.path)); }
  async create(p, c) { p = normalizePath(p); if (this.docs.has(p)) throw new Error("exists"); this._file(p, c); }
  async modify(f, c) { this.docs.set(f.path, c); }
  async createFolder(p) { this._folder(normalizePath(p)); }
  on() { return {}; }
}

module.exports = {
  Plugin, ItemView, Modal, PluginSettingTab, Setting, Notice,
  TFile, TFolder, normalizePath, requestUrl,
  __setRequestHandler, FakeVault,
};
