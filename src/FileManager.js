import { useState, useRef, useEffect, useCallback } from "react";

// Capacitor imports for Android native features
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Toast } from '@capacitor/toast';

/* ─────────────────────────────────────────
   DATA - Dynamic file system
───────────────────────────────────────── */
const getInitialFS = () => {
  // Try to load from localStorage first
  const saved = localStorage.getItem('fileManagerFS');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch(e) {}
  }
  
  return {
    name: "Internal Storage", type: "folder", modified: new Date().toISOString().split('T')[0], size: null,
    children: {
      "Documents": {
        name: "Documents", type: "folder", modified: new Date().toISOString().split('T')[0], size: null,
        children: {}
      },
      "Downloads": {
        name: "Downloads", type: "folder", modified: new Date().toISOString().split('T')[0], size: null,
        children: {}
      },
      "Pictures": {
        name: "Pictures", type: "folder", modified: new Date().toISOString().split('T')[0], size: null,
        children: {}
      },
      "Music": {
        name: "Music", type: "folder", modified: new Date().toISOString().split('T')[0], size: null,
        children: {}
      },
      "Videos": {
        name: "Videos", type: "folder", modified: new Date().toISOString().split('T')[0], size: null,
        children: {}
      }
    }
  };
};

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
const TYPE_COLOR = {
  folder: "#4f8ef7", pdf: "#e55353", sheet: "#34a853", text: "#8899aa",
  doc: "#4285f4", zip: "#f4a742", apk: "#a259f7",
  image: "#f472b6", audio: "#06b6d4", video: "#f59e0b", unknown: "#9ca3af",
};
const TYPE_GROUPS = {
  images: ["image"],
  videos: ["video"],
  audio:  ["audio"],
  docs:   ["pdf", "doc", "sheet", "text"],
  archives: ["zip", "apk"],
};
const MEDIA_TABS = [
  { id: "files",    label: "Files",    emoji: "📁" },
  { id: "images",   label: "Images",   emoji: "🖼" },
  { id: "videos",   label: "Videos",   emoji: "🎬" },
  { id: "audio",    label: "Audio",    emoji: "🎵" },
  { id: "docs",     label: "Docs",     emoji: "📄" },
  { id: "archives", label: "Archives", emoji: "📦" },
];
const BOTTOM_TABS = [
  { id: "home",     emoji: "🏠", label: "Home" },
  { id: "cloud",    emoji: "☁️",  label: "Cloud" },
  { id: "share",    emoji: "🔗", label: "Share" },
  { id: "settings", emoji: "⚙️",  label: "Settings" },
];
const SORT_OPTIONS = [
  { id: "name", label: "Name" },
  { id: "date", label: "Date modified" },
  { id: "size", label: "File size" },
  { id: "type", label: "File type" },
];
const SHARE_APPS = [
  { name: "WhatsApp",  emoji: "💬", package: "com.whatsapp" },
  { name: "Gmail",     emoji: "📧", package: "com.google.android.gm" },
  { name: "Telegram",  emoji: "✈️",  package: "org.telegram.messenger" },
  { name: "Drive",     emoji: "🟦", package: "com.google.android.apps.docs" },
  { name: "Messages",  emoji: "🗨️",  package: "com.google.android.apps.messaging" },
];

function parseSizeBytes(s) {
  if (!s) return 0;
  const [n, u] = s.split(" ");
  const map = { KB: 1024, MB: 1048576, GB: 1073741824 };
  return parseFloat(n) * (map[u] || 1);
}

function flatAll(node, filter) {
  const res = [];
  (function walk(n) {
    if (!n.children) return;
    Object.values(n.children).forEach(c => {
      if (c.type !== "folder") { if (!filter || filter(c)) res.push(c); }
      else walk(c);
    });
  })(node);
  return res;
}

function groupByMonth(items) {
  const groups = {};
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  items.forEach(i => {
    const label = i.modified === today ? "Today"
      : i.modified === yesterday ? "Yesterday"
      : i.modified?.slice(0, 7) || "Unknown";
    (groups[label] = groups[label] || []).push(i);
  });
  return groups;
}

// Show native toast
const showNativeToast = async (message) => {
  try {
    await Toast.show({
      text: message,
      duration: "short",
      position: "bottom"
    });
  } catch(e) {
    console.log('Toast error:', e);
  }
};

// Share via native Android
const nativeShare = async (text, title) => {
  try {
    await Share.share({
      title: title || 'Share File',
      text: text,
      dialogTitle: 'Share via',
    });
    return true;
  } catch(e) {
    console.log('Share error:', e);
    return false;
  }
};

/* ─────────────────────────────────────────
   FILE ICON SVG
───────────────────────────────────────── */
function FileIcon({ type, size = 38 }) {
  const c = TYPE_COLOR[type] || TYPE_COLOR.unknown;
  const s = size;
  const defs = {
    folder: <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" fill={c}/><path d="M3 9h18" stroke="#fff" strokeWidth="1" strokeOpacity=".22"/></svg>,
    pdf:    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill={c}/><rect x="7" y="7" width="10" height="1.5" rx=".75" fill="#fff" opacity=".35"/><text x="6.5" y="16" fontSize="6" fill="#fff" fontWeight="bold" fontFamily="sans-serif">PDF</text></svg>,
    sheet:  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill={c}/><rect x="8" y="7" width="8" height="1.5" rx=".75" fill="#fff" opacity=".7"/><rect x="8" y="11" width="8" height="1.5" rx=".75" fill="#fff" opacity=".5"/><rect x="8" y="15" width="5" height="1.5" rx=".75" fill="#fff" opacity=".35"/></svg>,
    text:   <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill={c}/><rect x="7" y="7" width="10" height="1.5" rx=".75" fill="#fff" opacity=".7"/><rect x="7" y="11" width="10" height="1.5" rx=".75" fill="#fff" opacity=".5"/><rect x="7" y="15" width="6" height="1.5" rx=".75" fill="#fff" opacity=".35"/></svg>,
    doc:    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill={c}/><rect x="7" y="7" width="10" height="1.5" rx=".75" fill="#fff" opacity=".7"/><rect x="7" y="11" width="10" height="1.5" rx=".75" fill="#fff" opacity=".5"/><rect x="7" y="15" width="7" height="1.5" rx=".75" fill="#fff" opacity=".35"/></svg>,
    zip:    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill={c}/><rect x="10" y="4" width="4" height="3" rx="1" fill="#fff" opacity=".3"/><rect x="10" y="9" width="4" height="3" rx="1" fill="#fff" opacity=".5"/><rect x="10" y="14" width="4" height="3" rx="1" fill="#fff" opacity=".3"/></svg>,
    apk:    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill={c}/><text x="6.5" y="15" fontSize="6" fill="#fff" fontWeight="bold" fontFamily="sans-serif">APK</text></svg>,
    image:  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" fill={c}/><circle cx="8" cy="10" r="2" fill="#fff" opacity=".6"/><path d="M3 17l5-5 4 4 3-3 6 4" stroke="#fff" strokeWidth="1.5" strokeOpacity=".45" strokeLinejoin="round"/></svg>,
    audio:  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="9" fill={c}/><circle cx="12" cy="12" r="3" fill="#fff" opacity=".45"/><circle cx="12" cy="12" r="1.5" fill="#fff"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2" stroke="#fff" strokeWidth="1.2" strokeOpacity=".25"/></svg>,
    video:  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="15" height="14" rx="2" fill={c}/><path d="M17 9l5-3v12l-5-3V9z" fill={c} opacity=".7"/><path d="M9 9l4 3-4 3V9z" fill="#fff" opacity=".85"/></svg>,
  };
  return defs[type] || defs.text;
}

/* ─────────────────────────────────────────
   SUB-COMPONENTS
───────────────────────────────────────── */
function Checkbox({ checked, onClick }) {
  return (
    <div onClick={onClick} style={{
      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
      border: checked ? "none" : "1.5px solid #2d3a5a",
      background: checked ? "#4f8ef7" : "transparent",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all .15s", cursor: "pointer",
    }}>
      {checked && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>}
    </div>
  );
}

function Breadcrumb({ path, onNavigate }) {
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2, fontSize: 12, color: "#7a8aaa", marginTop: 2 }}>
      {path.map((seg, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {i > 0 && <span style={{ opacity: .35 }}>/</span>}
          <span onClick={() => onNavigate(i)} style={{
            cursor: "pointer", padding: "1px 3px", borderRadius: 4,
            color: i === path.length - 1 ? "#e2e8f7" : "#7a8aaa",
            fontWeight: i === path.length - 1 ? 600 : 400,
          }}>{seg}</span>
        </span>
      ))}
    </div>
  );
}

function ContextMenu({ x, y, item, onClose, onShare, onRename, onDelete, onProperties }) {
  const actions = [
    { label: "Open",       emoji: "▶",  fn: onClose, danger: false },
    { label: "Share",      emoji: "⇪",  fn: () => { onShare(item); onClose(); }, danger: false },
    { label: "Copy",       emoji: "⎘",  fn: () => { onClose(); }, danger: false },
    { label: "Rename",     emoji: "✎",  fn: () => { onRename(item); onClose(); }, danger: false },
    { label: "Properties", emoji: "ℹ",  fn: () => { onProperties(item); onClose(); }, danger: false },
    { label: "Delete",     emoji: "🗑", fn: () => { onDelete(item); onClose(); }, danger: true },
  ];
  const left = Math.min(x, 210);
  return (
    <div onClick={e => e.stopPropagation()} style={{
      position: "fixed", top: y, left: left, zIndex: 9999,
      background: "#1e2330", border: "1px solid #2d3348",
      borderRadius: 13, boxShadow: "0 10px 40px #0009",
      minWidth: 176, overflow: "hidden",
      animation: "ctxIn .12s ease",
    }}>
      {actions.map(a => (
        <button key={a.label} onClick={a.fn} style={{
          display: "flex", alignItems: "center", gap: 10,
          width: "100%", padding: "11px 18px", background: "none",
          border: "none", cursor: "pointer", fontFamily: "inherit",
          fontSize: 14, textAlign: "left", color: a.danger ? "#f87171" : "#c9d1e9",
          transition: "background .1s",
        }}
          onMouseEnter={e => e.currentTarget.style.background = "#262e48"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}
        >
          <span style={{ width: 18, textAlign: "center", fontSize: 14 }}>{a.emoji}</span>
          {a.label}
        </button>
      ))}
    </div>
  );
}

function BottomSheet({ title, onClose, children }) {
  return (
    <>
      <div onClick={onClose} style={{
        position: "absolute", inset: 0, background: "#0008", zIndex: 8000,
        animation: "fadeOverlay .2s ease",
      }} />
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: "#1a2035", borderRadius: "20px 20px 0 0",
        zIndex: 8001, maxHeight: "75%", overflowY: "auto",
        animation: "sheetUp .28s cubic-bezier(.22,.9,.36,1)",
      }}>
        <div style={{ width: 36, height: 4, background: "#2d3a5a", borderRadius: 2, margin: "12px auto 0" }} />
        {title && <div style={{ fontSize: 16, fontWeight: 600, color: "#e2e8f7", padding: "14px 20px 0" }}>{title}</div>}
        {children}
        <div style={{ height: 24 }} />
      </div>
    </>
  );
}

function Notification({ msg }) {
  return (
    <div style={{
      position: "absolute", bottom: 130, left: "50%",
      transform: "translateX(-50%)",
      background: "#1e2a4a", border: "1px solid #2d3f70",
      color: "#c9d1e9", fontSize: 13, borderRadius: 20,
      padding: "9px 20px", whiteSpace: "nowrap",
      boxShadow: "0 4px 20px #0006", zIndex: 9998,
      pointerEvents: "none",
      animation: "notifIn 2.3s ease forwards",
    }}>{msg}</div>
  );
}

/* ─────────────────────────────────────────
   MAIN APP
───────────────────────────────────────── */
export default function FileManager() {
  const [fs, setFs] = useState(() => getInitialFS());
  const [path, setPath] = useState(["Internal Storage"]);
  const [navTab, setNavTab] = useState("files");
  const [bottomTab, setBottomTab] = useState("home");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [view, setView] = useState("list");
  const [selected, setSelected] = useState(new Set());
  const [ctx, setCtx] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [sheetData, setSheetData] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [notif, setNotif] = useState(null);
  const [notifKey, setNotifKey] = useState(0);
  const [toggles, setToggles] = useState({ autoBackup: true, wifiOnly: false, darkMode: true, compress: false });
  const renameRef = useRef(null);

  // Save FS to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('fileManagerFS', JSON.stringify(fs));
  }, [fs]);

  useEffect(() => { if (renaming && renameRef.current) { renameRef.current.focus(); renameRef.current.select(); } }, [renaming]);

  const showNotif = useCallback((msg) => {
    setNotif(msg); 
    setNotifKey(k => k + 1);
    // Also show native toast on Android
    if (window.Capacitor) {
      showNativeToast(msg);
    }
    const t = setTimeout(() => setNotif(null), 2300);
    return () => clearTimeout(t);
  }, []);

  const getNode = useCallback((p) => {
    let node = fs;
    for (let i = 1; i < p.length; i++) { node = node.children?.[p[i]]; if (!node) return null; }
    return node;
  }, [fs]);

  const getItems = useCallback(() => {
    let items;
    if (navTab !== "files") {
      const allowed = TYPE_GROUPS[navTab] || [];
      items = flatAll(fs, i => allowed.includes(i.type));
    } else {
      const cur = getNode(path);
      items = cur?.children ? Object.values(cur.children) : [];
    }
    if (search) items = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    return [...items].sort((a, b) => {
      if (navTab === "files") {
        if (a.type === "folder" && b.type !== "folder") return -1;
        if (a.type !== "folder" && b.type === "folder") return 1;
      }
      let cmp = 0;
      if (sort === "name") cmp = a.name.localeCompare(b.name);
      else if (sort === "date") cmp = (b.modified || "").localeCompare(a.modified || "");
      else if (sort === "size") cmp = parseSizeBytes(a.size) - parseSizeBytes(b.size);
      else if (sort === "type") cmp = a.type.localeCompare(b.type);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [fs, path, navTab, search, sort, sortDir, getNode]);

  const navigate = (item) => {
    if (item.type === "folder") { setPath(p => [...p, item.name]); setSelected(new Set()); setSearch(""); }
    else if (item.url) window.open(item.url, "_blank");
    else showNotif(`Opening "${item.name}"…`);
  };
  
  const navigateTo = (idx) => { setPath(p => p.slice(0, idx + 1)); setSelected(new Set()); setSearch(""); };

  const toggleSel = (name, e) => {
    e.stopPropagation();
    setSelected(s => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });
  };

  const mutateFs = (fn) => setFs(prev => { const clone = JSON.parse(JSON.stringify(prev)); fn(clone); return clone; });
  const getPathNode = (clone) => { let node = clone; for (let i = 1; i < path.length; i++) node = node.children[path[i]]; return node; };

  const deleteItem = (item) => {
    mutateFs(clone => { delete getPathNode(clone).children[item.name]; });
    setSelected(s => { const n = new Set(s); n.delete(item.name); return n; });
    showNotif(`"${item.name}" deleted`);
  };
  
  const deleteSelected = () => {
    const cnt = selected.size;
    mutateFs(clone => { const node = getPathNode(clone); selected.forEach(n => delete node.children[n]); });
    setSelected(new Set());
    showNotif(`${cnt} item(s) deleted`);
  };
  
  const commitRename = () => {
    if (!renameVal || renameVal === renaming) { setRenaming(null); return; }
    mutateFs(clone => {
      const node = getPathNode(clone);
      const entry = node.children[renaming];
      if (entry) { delete node.children[renaming]; entry.name = renameVal; node.children[renameVal] = entry; }
    });
    showNotif(`Renamed to "${renameVal}"`);
    setRenaming(null);
  };
  
  const newFolder = () => {
    const name = `New Folder ${Math.floor(Math.random() * 9000 + 1000)}`;
    const date = new Date().toISOString().split('T')[0];
    mutateFs(clone => { 
      getPathNode(clone).children[name] = { 
        name, type: "folder", modified: date, size: null, children: {} 
      }; 
    });
    showNotif(`"${name}" created`);
  };

  const newFile = () => {
    const name = `New_File_${Math.floor(Math.random() * 9000 + 1000)}.txt`;
    const date = new Date().toISOString().split('T')[0];
    mutateFs(clone => { 
      getPathNode(clone).children[name] = { 
        name, type: "text", modified: date, size: "0 KB"
      }; 
    });
    showNotif(`"${name}" created`);
  };

  const openShare = async (item) => {
    const shareText = item ? `Sharing file: ${item.name}` : `Sharing ${selected.size} selected files`;
    const success = await nativeShare(shareText, "Share File");
    if (success) {
      showNotif("Share dialog opened");
    } else {
      setSheet("share"); 
      setSheetData(item?.name || "selected files");
    }
  };
  
  const openProps = (item) => {
    const items = getItems();
    const found = items.find(i => i.name === item.name) || item;
    setSheet("props"); 
    setSheetData(found);
  };
  
  const closeSheet = () => { setSheet(null); setSheetData(null); };

  const items = getItems();

  // Calculate storage usage
  const calculateStorage = () => {
    const allFiles = flatAll(fs, () => true);
    const totalBytes = allFiles.reduce((sum, f) => sum + parseSizeBytes(f.size), 0);
    const usedGB = Math.round(totalBytes / 1073741824 * 10) / 10;
    return { used: usedGB, total: 64 }; // 64GB base for Redmi Note 7 Pro
  };
  
  const storage = calculateStorage();
  const used = storage.used;
  const total = storage.total;
  const pct = (used / total) * 100;

  /* ── RENDERS ── */
  const renderHeader = () => (
    <div style={{ padding: "4px 20px 10px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
      {path.length > 1 && (
        <button onClick={() => navigateTo(path.length - 2)} style={{
          background: "#1e2535", border: "none", borderRadius: 10,
          width: 36, height: 36, cursor: "pointer", color: "#c9d1e9",
          fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>‹</button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#e8eef8", letterSpacing: -0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {path[path.length - 1]}
        </div>
        {path.length > 1 && <Breadcrumb path={path} onNavigate={navigateTo} />}
      </div>
      <button onClick={newFolder} title="New folder" style={{
        background: "#1e2535", border: "none", borderRadius: 10, width: 36, height: 36,
        cursor: "pointer", color: "#4f8ef7", fontSize: 24,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>+</button>
      <button onClick={newFile} title="New file" style={{
        background: "#1e2535", border: "none", borderRadius: 10, width: 36, height: 36,
        cursor: "pointer", color: "#34a853", fontSize: 20,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>📄</button>
    </div>
  );

  const renderMediaTabs = () => (
    <div style={{ display: "flex", overflowX: "auto", padding: "0 16px 10px", flexShrink: 0, gap: 6, scrollbarWidth: "none" }}>
      {MEDIA_TABS.map(t => (
        <button key={t.id} onClick={() => { setNavTab(t.id); setSelected(new Set()); setSearch(""); }} style={{
          flexShrink: 0, padding: "7px 14px", borderRadius: 20, border: "none", cursor: "pointer",
          fontSize: 12, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5,
          background: navTab === t.id ? "#4f8ef7" : "#1a2035",
          color: navTab === t.id ? "#fff" : "#7a8aaa",
          fontWeight: navTab === t.id ? 600 : 400,
          transition: "all .2s",
        }}>{t.emoji} {t.label}</button>
      ))}
    </div>
  );

  const renderToolbar = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderBottom: "1px solid #1a1f2e", flexShrink: 0 }}>
      <div style={{ flex: 1, position: "relative" }}>
        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#5a6585", fontSize: 14, pointerEvents: "none" }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files…" style={{
          width: "100%", padding: "7px 10px 7px 32px", background: "#181d2b",
          border: "1px solid #262d42", borderRadius: 20, color: "#c9d1e9",
          fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
        }} />
      </div>
      <button onClick={() => setSheet("sort")} style={{
        background: "#181d2b", border: "1px solid #262d42", borderRadius: 8,
        color: "#9aa3bf", fontSize: 12, padding: "6px 9px", fontFamily: "inherit", cursor: "pointer", outline: "none",
        display: "flex", alignItems: "center", gap: 4,
      }}>
        ⇅ {sort.charAt(0).toUpperCase() + sort.slice(1)}
        <span style={{ fontSize: 10, opacity: .7 }}>{sortDir === "asc" ? "↑" : "↓"}</span>
      </button>
      <button onClick={() => setView(v => v === "list" ? "grid" : "list")} style={{
        background: "#262d42", border: "none", borderRadius: 8,
        color: "#9aa3bf", padding: "6px 10px", cursor: "pointer", fontSize: 16, lineHeight: 1,
        display: "flex", alignItems: "center",
      }}>{view === "list" ? "⊞" : "☰"}</button>
      {selected.size > 0 && <>
        <button onClick={() => setSelected(new Set(items.map(i => i.name)))} style={{ background: "#3b4f8a", border: "none", borderRadius: 8, color: "#c9d1e9", padding: "6px 9px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>All</button>
        <button onClick={() => openShare(null)} style={{ background: "#1e3a50", border: "none", borderRadius: 8, color: "#60a5fa", padding: "6px 9px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Share</button>
        <button onClick={deleteSelected} style={{ background: "#7f1d1d", border: "none", borderRadius: 8, color: "#fca5a5", padding: "6px 9px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Del ({selected.size})</button>
      </>}
    </div>
  );

  const renderListRow = (item, idx) => {
    const isSel = selected.has(item.name);
    const isRen = renaming === item.name;
    const haThumb = (item.type === "image" || item.type === "video") && item.thumb;
    return (
      <div key={item.name} onClick={() => navigate(item)} onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, item }); }}
        style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 20px",
          background: isSel ? "#1a2a50" : "transparent", cursor: "pointer",
          transition: "background .12s",
          animation: `rowIn .18s ${Math.min(idx * 0.025, 0.3)}s both`,
        }}
        onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "#151c30"; }}
        onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
      >
        <Checkbox checked={isSel} onClick={e => toggleSel(item.name, e)} />
        {haThumb
          ? <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "#1a2035", position: "relative" }}>
              <img src={item.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
              {item.type === "video" && <div style={{ position: "absolute", inset: 0, background: "#0004", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>▶</div>}
            </div>
          : <FileIcon type={item.type} size={38} />
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          {isRen
            ? <input ref={renameRef} value={renameVal} onChange={e => setRenameVal(e.target.value)}
                onBlur={commitRename} onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }}
                onClick={e => e.stopPropagation()}
                style={{ width: "100%", background: "#0f1320", border: "1px solid #4f8ef7", borderRadius: 6, color: "#e8eef8", fontSize: 14, padding: "2px 7px", fontFamily: "inherit", outline: "none" }}
              />
            : <div style={{ fontSize: 14, fontWeight: 500, color: "#e2e8f7", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.name}
                {item.url && <span style={{ marginLeft: 5, fontSize: 10, color: "#4f8ef7", verticalAlign: "middle" }}>↗</span>}
              </div>
          }
          <div style={{ fontSize: 11, color: "#5a6585", marginTop: 2 }}>
            {item.artist && <span style={{ color: "#4f8ef7" }}>{item.artist} · </span>}
            {item.modified}{item.size ? ` · ${item.size}` : ""}
            {item.type === "folder" && item.children ? ` · ${Object.keys(item.children).length} items` : ""}
          </div>
        </div>
        {item.type === "folder" && <span style={{ color: "#3d4a6a", fontSize: 18 }}>›</span>}
      </div>
    );
  };

  const renderGrid = () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, padding: "8px 14px" }}>
      {items.map((item, idx) => {
        const isSel = selected.has(item.name);
        const haThumb = (item.type === "image" || item.type === "video") && item.thumb;
        return (
          <div key={item.name} onClick={() => navigate(item)} onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, item }); }}
            style={{
              background: isSel ? "#1a2a50" : "#151c30",
              borderRadius: 14, border: `1.5px solid ${isSel ? "#4f8ef7" : "#1e2535"}`,
              padding: haThumb ? "0 0 8px" : "12px 8px 10px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
              cursor: "pointer", overflow: "hidden",
              animation: `rowIn .18s ${Math.min(idx * 0.02, 0.3)}s both`,
            }}
          >
            {haThumb
              ? <div style={{ width: "100%", aspectRatio: "1", overflow: "hidden", position: "relative" }}>
                  <img src={item.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                  {item.type === "video" && <div style={{ position: "absolute", inset: 0, background: "#0005", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>▶</div>}
                  {isSel && <div style={{ position: "absolute", top: 5, right: 5, width: 20, height: 20, borderRadius: "50%", background: "#4f8ef7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff", fontWeight: 700 }}>✓</div>}
                </div>
              : <FileIcon type={item.type} size={34} />
            }
            <div style={{ fontSize: 10, color: "#c9d1e9", textAlign: "center", wordBreak: "break-all", lineHeight: 1.3, padding: haThumb ? "0 6px" : "0", overflow: "hidden", maxHeight: 30 }}>{item.name}</div>
            <div style={{ fontSize: 10, color: "#5a6585" }}>{item.size || (item.children ? `${Object.keys(item.children).length} items` : "")}</div>
          </div>
        );
      })}
    </div>
  );

  const renderImageGrid = () => {
    const groups = groupByMonth(items);
    return (
      <>
        {Object.entries(groups).map(([label, gitems]) => (
          <div key={label}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#5a6585", padding: "10px 16px 5px", letterSpacing: ".5px", textTransform: "uppercase" }}>{label}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2, padding: "0 2px" }}>
              {gitems.map(item => {
                const isSel = selected.has(item.name);
                return (
                  <div key={item.name} onClick={() => navigate(item)} onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, item }); }}
                    style={{ aspectRatio: "1", overflow: "hidden", background: "#1a2035", position: "relative", cursor: "pointer", border: `2.5px solid ${isSel ? "#4f8ef7" : "transparent"}` }}
                  >
                    {item.thumb
                      ? <img src={item.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><FileIcon type={item.type} size={28} /></div>
                    }
                    {isSel && <div style={{ position: "absolute", top: 5, right: 5, width: 20, height: 20, borderRadius: "50%", background: "#4f8ef7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff", fontWeight: 700 }}>✓</div>}
                    <div onClick={e => toggleSel(item.name, e)} style={{ position: "absolute", inset: 0 }} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </>
    );
  };

  const renderFileArea = () => {
    if (!items.length)
      return <div style={{ textAlign: "center", color: "#3d4a6a", fontSize: 14, paddingTop: 60 }}><div style={{ fontSize: 40, marginBottom: 12, opacity: .35 }}>📂</div>{search ? "No matches" : "Empty folder"}</div>;
    if (navTab === "images") return renderImageGrid();
    if (view === "grid") return renderGrid();
    if (navTab !== "files") {
      const groups = groupByMonth(items);
      return Object.entries(groups).map(([label, gitems]) => (
        <div key={label}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#5a6585", padding: "10px 16px 4px", letterSpacing: ".5px", textTransform: "uppercase" }}>{label}</div>
          {gitems.map((item, idx) => renderListRow(item, idx))}
        </div>
      ));
    }
    return items.map((item, idx) => renderListRow(item, idx));
  };

  const renderStorage = () => {
    const freeGB = (total - used).toFixed(1);
    return (
      <div style={{ padding: "12px 16px", borderTop: "1px solid #1a1f2e", background: "#131726", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12, color: "#7a8aaa" }}>
          <span>Internal Storage</span><span style={{ color: "#c9d1e9" }}>{used} GB / {total} GB</span>
        </div>
        <div style={{ height: 5, background: "#1e2535", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#4f8ef7,#a259f7)", borderRadius: 99 }} />
        </div>
        <div style={{ fontSize: 11, color: "#5a6585", marginTop: 5 }}>{freeGB} GB free</div>
      </div>
    );
  };

  /* ── CLOUD TAB ── */
  const renderCloud = () => {
    const services = [
      { emoji: "🟦", name: "Google Drive",  space: "12.4 GB / 15 GB", pct: 83, color: "#4285f4", url: "https://drive.google.com" },
      { emoji: "🟩", name: "Google Photos", space: "Unlimited (backup on)", pct: 0, color: "#34a853", url: "https://photos.google.com" },
      { emoji: "🔵", name: "Dropbox",        space: "2.1 GB / 2 GB",  pct: 100, color: "#0061ff", url: "https://dropbox.com" },
      { emoji: "🔷", name: "OneDrive",       space: "4.8 GB / 5 GB",  pct: 96, color: "#0078d4", url: "https://onedrive.com" },
    ];
    const recent = [
      { emoji: "📄", name: "Resume_2026.pdf",      where: "Google Drive",  time: "2h ago",  url: "https://drive.google.com" },
      { emoji: "🖼", name: "IMG_20260407.jpg",      where: "Google Photos", time: "5h ago",  url: "https://photos.google.com" },
      { emoji: "📦", name: "archive.zip",           where: "Dropbox",       time: "Yesterday", url: "https://dropbox.com" },
    ];
    return (
      <>
        <div style={{ padding: "4px 20px 10px", display: "flex", alignItems: "center" }}><div style={{ fontSize: 20, fontWeight: 700, color: "#e8eef8" }}>Cloud Storage</div></div>
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 16px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#5a6585", letterSpacing: ".5px", textTransform: "uppercase", margin: "6px 0 10px" }}>Connected</div>
          {services.map(s => (
            <div key={s.name} onClick={() => window.open(s.url, "_blank")} style={{ background: "#151c30", borderRadius: 14, border: "1px solid #1e2535", padding: "14px 16px", marginBottom: 10, cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = "#1a2340"} onMouseLeave={e => e.currentTarget.style.background = "#151c30"}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <span style={{ fontSize: 22 }}>{s.emoji}</span>
                <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500, color: "#e2e8f7" }}>{s.name}</div><div style={{ fontSize: 11, color: "#5a6585" }}>{s.space}</div></div>
                <span style={{ fontSize: 13, color: "#4f8ef7" }}>↗</span>
              </div>
              {s.pct > 0
                ? <div style={{ height: 3, background: "#1e2535", borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${s.pct}%`, background: s.pct > 95 ? "#f87171" : s.color, borderRadius: 99 }} /></div>
                : <div style={{ fontSize: 11, color: "#34a853" }}>∞ Unlimited backup</div>
              }
            </div>
          ))}
          <div style={{ fontSize: 11, fontWeight: 600, color: "#5a6585", letterSpacing: ".5px", textTransform: "uppercase", margin: "14px 0 10px" }}>Recently Synced</div>
          {recent.map(r => (
            <div key={r.name} onClick={() => window.open(r.url, "_blank")} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", cursor: "pointer", borderBottom: "1px solid #1a1f2e" }}>
              <span style={{ fontSize: 22, width: 38, textAlign: "center" }}>{r.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#e2e8f7", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name} <span style={{ fontSize: 10, color: "#4f8ef7" }}>↗</span></div>
                <div style={{ fontSize: 11, color: "#5a6585" }}>{r.where} · {r.time}</div>
              </div>
              <span style={{ fontSize: 12, color: "#34a853", flexShrink: 0 }}>✓ Synced</span>
            </div>
          ))}
        </div>
      </>
    );
  };

  /* ── SHARE TAB ── */
  const renderShareTab = () => {
    const recent = [
      { emoji: "📊", name: "Budget_Q1.xlsx",       size: "84 KB" },
      { emoji: "📄", name: "Resume_2026.pdf",       size: "148 KB" },
      { emoji: "🖼", name: "IMG_20260408_001.jpg",  size: "3.8 MB" },
    ];
    return (
      <>
        <div style={{ padding: "4px 20px 10px", display: "flex", alignItems: "center" }}><div style={{ fontSize: 20, fontWeight: 700, color: "#e8eef8" }}>Share</div></div>
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 16px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#5a6585", letterSpacing: ".5px", textTransform: "uppercase", margin: "6px 0 12px" }}>Quick Share</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
            {SHARE_APPS.map(a => (
              <div key={a.name} onClick={() => showNotif(`${a.name} — ready to share`)}
                style={{ background: "#151c30", borderRadius: 14, border: "1px solid #1e2535", padding: "14px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 7, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = "#1a2340"} onMouseLeave={e => e.currentTarget.style.background = "#151c30"}
              >
                <span style={{ fontSize: 24 }}>{a.emoji}</span>
                <span style={{ fontSize: 11, color: "#c9d1e9" }}>{a.name}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#5a6585", letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 10 }}>Recently Shared</div>
          {recent.map(r => (
            <div key={r.name} onClick={() => { setSheet("share"); setSheetData(r.name); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid #1a1f2e", cursor: "pointer" }}>
              <span style={{ fontSize: 24, width: 38, textAlign: "center" }}>{r.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#e2e8f7", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                <div style={{ fontSize: 11, color: "#5a6585" }}>{r.size} · Tap to share again</div>
              </div>
              <span style={{ fontSize: 20, color: "#4f8ef7" }}>⇪</span>
            </div>
          ))}
          <div style={{ marginTop: 16, padding: "14px 16px", background: "#151c30", borderRadius: 14, border: "1px solid #1e2535" }}>
            <div style={{ fontSize: 13, color: "#e2e8f7", fontWeight: 500, marginBottom: 4 }}>📡 Nearby Share</div>
            <div style={{ fontSize: 12, color: "#5a6585", marginBottom: 10 }}>Share with nearby Android devices instantly</div>
            <button onClick={() => showNotif("Nearby Share — scanning for devices…")} style={{
              background: "#4f8ef7", border: "none", borderRadius: 20, color: "#fff",
              padding: "8px 20px", fontSize: 13, fontFamily: "inherit", cursor: "pointer", fontWeight: 500,
            }}>Enable Nearby Share</button>
          </div>
        </div>
      </>
    );
  };

  /* ── SETTINGS TAB ── */
  const renderSettings = () => {
    const groups = [
      {
        label: "Storage", rows: [
          { emoji: "🗂", title: "Default storage", sub: "Internal (128 GB)", arrow: true },
          { emoji: "🔢", title: "Show hidden files", sub: "Files starting with .", toggle: "showHidden", val: false },
          { emoji: "🗜", title: "Auto-compress downloads", sub: "Compress files on import", toggle: "compress", val: toggles.compress },
        ],
      },
      {
        label: "Backup", rows: [
          { emoji: "☁️", title: "Auto backup",  sub: "Sync to Google Drive",    toggle: "autoBackup", val: toggles.autoBackup },
          { emoji: "📶", title: "Wi-Fi only",   sub: "Don't use mobile data",   toggle: "wifiOnly",   val: toggles.wifiOnly },
          { emoji: "🕐", title: "Last backup",  sub: "Today, 6:32 AM", arrow: true },
        ],
      },
      {
        label: "Appearance", rows: [
          { emoji: "🌙", title: "Dark mode",  sub: "Always dark theme", toggle: "darkMode", val: toggles.darkMode },
          { emoji: "🔤", title: "Sort by",    sub: `${sort.charAt(0).toUpperCase() + sort.slice(1)}, ${sortDir === "asc" ? "Ascending" : "Descending"}`, arrow: true, action: () => setSheet("sort") },
        ],
      },
      {
        label: "About", rows: [
          { emoji: "📱", title: "Version",       sub: "File Manager 3.4.1 for Redmi Note 7 Pro" },
          { emoji: "🔒", title: "Permissions",   sub: "Storage, Bluetooth, Network", arrow: true },
          { emoji: "⭐", title: "Rate this app", sub: "Google Play Store", url: "https://play.google.com" },
          { emoji: "📬", title: "Send feedback", sub: "help@filemanager.app", url: "mailto:help@filemanager.app" },
        ],
      },
    ];
    return (
      <>
        <div style={{ padding: "4px 20px 10px" }}><div style={{ fontSize: 20, fontWeight: 700, color: "#e8eef8" }}>Settings</div></div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {groups.map(g => (
            <div key={g.label}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#5a6585", letterSpacing: ".5px", textTransform: "uppercase", padding: "12px 20px 6px" }}>{g.label}</div>
              {g.rows.map(r => (
                <div key={r.title}
                  onClick={() => { if (r.url) window.open(r.url, "_blank"); else if (r.action) r.action(); else if (r.toggle) setToggles(t => ({ ...t, [r.toggle]: !t[r.toggle] })); }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", borderBottom: "1px solid #1a1f2e", cursor: "pointer", transition: "background .12s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#151c30"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 20, width: 28, textAlign: "center" }}>{r.emoji}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: "#e2e8f7" }}>{r.title}</div>
                      <div style={{ fontSize: 12, color: "#5a6585" }}>{r.sub}</div>
                    </div>
                  </div>
                  {r.toggle
                    ? <div onClick={e => { e.stopPropagation(); setToggles(t => ({ ...t, [r.toggle]: !t[r.toggle] })); }} style={{
                        width: 38, height: 22, borderRadius: 11,
                        background: (r.val !== undefined ? r.val : toggles[r.toggle]) ? "#4f8ef7" : "#2d3a5a",
                        position: "relative", flexShrink: 0, cursor: "pointer", transition: "background .2s",
                      }}>
                        <div style={{
                          position: "absolute", top: 3,
                          left: (r.val !== undefined ? r.val : toggles[r.toggle]) ? 19 : 3,
                          width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s",
                        }} />
                      </div>
                    : (r.arrow || r.url) ? <span style={{ color: "#3d4a6a", fontSize: 18 }}>›</span> : null
                  }
                </div>
              ))}
            </div>
          ))}
        </div>
      </>
    );
  };

  /* ── SORT SHEET ── */
  const renderSortSheet = () => (
    <BottomSheet title="Sort by" onClose={closeSheet}>
      {SORT_OPTIONS.map(opt => (
        <div key={opt.id} onClick={() => { setSort(opt.id); closeSheet(); }}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 20px", borderBottom: "1px solid #1a2535", cursor: "pointer" }}
          onMouseEnter={e => e.currentTarget.style.background = "#1e2a40"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          <div style={{ width: 22, textAlign: "center", color: sort === opt.id ? "#4f8ef7" : "transparent", fontSize: 14 }}>✓</div>
          <div style={{ fontSize: 14, color: "#e2e8f7" }}>{opt.label}</div>
        </div>
      ))}
      <div style={{ borderTop: "1px solid #1a2535", margin: "4px 0" }} />
      {[["asc", "Ascending ↑"], ["desc", "Descending ↓"]].map(([k, l]) => (
        <div key={k} onClick={() => { setSortDir(k); closeSheet(); }}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 20px", cursor: "pointer" }}
          onMouseEnter={e => e.currentTarget.style.background = "#1e2a40"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          <div style={{ width: 22, textAlign: "center", color: sortDir === k ? "#4f8ef7" : "transparent", fontSize: 14 }}>✓</div>
          <div style={{ fontSize: 14, color: "#e2e8f7" }}>{l}</div>
        </div>
      ))}
    </BottomSheet>
  );

  /* ── SHARE SHEET ── */
  const renderShareSheet = () => (
    <BottomSheet title={`Share "${sheetData}"`} onClose={closeSheet}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, padding: "16px 20px" }}>
        {SHARE_APPS.map(a => (
          <div key={a.name} onClick={() => { showNotif(`Sharing via ${a.name}`); closeSheet(); }}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}
          >
            <div style={{ width: 50, height: 50, borderRadius: 14, background: "#1e2a40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{a.emoji}</div>
            <span style={{ fontSize: 11, color: "#9aa3bf" }}>{a.name}</span>
          </div>
        ))}
      </div>
      {[
        { emoji: "📡", title: "Nearby Share", sub: "Share with nearby devices", action: () => { showNotif("Nearby Share — scanning…"); closeSheet(); } },
        { emoji: "🔵", title: "Bluetooth",    sub: "Pair and send",             action: () => { showNotif("Bluetooth share started"); closeSheet(); } },
      ].map(row => (
        <div key={row.title} onClick={row.action} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderTop: "1px solid #1a2535", cursor: "pointer" }}
          onMouseEnter={e => e.currentTarget.style.background = "#1e2a40"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          <span style={{ fontSize: 22 }}>{row.emoji}</span>
          <div>
            <div style={{ fontSize: 14, color: "#e2e8f7" }}>{row.title}</div>
            <div style={{ fontSize: 12, color: "#5a6585" }}>{row.sub}</div>
          </div>
        </div>
      ))}
    </BottomSheet>
  );

  /* ── PROPERTIES SHEET ── */
  const renderPropsSheet = () => {
    const item = sheetData || {};
    const rows = [
      ["Name", item.name || "—"],
      ["Type", (item.type || "—").toUpperCase()],
      ["Size", item.size || (item.type === "folder" ? `${Object.keys(item.children || {}).length} items` : "—")],
      ["Modified", item.modified || "—"],
      ["Path", "/" + path.join("/") + "/" + (item.name || "")],
    ];
    return (
      <BottomSheet title="Properties" onClose={closeSheet}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 16px" }}><FileIcon type={item.type} size={52} /></div>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 20px", borderBottom: "1px solid #1a2535" }}>
            <span style={{ fontSize: 13, color: "#5a6585", width: 72, flexShrink: 0 }}>{k}</span>
            <span style={{ fontSize: 13, color: "#c9d1e9", textAlign: "right", wordBreak: "break-all", maxWidth: 220 }}>{v}</span>
          </div>
        ))}
      </BottomSheet>
    );
  };

  /* ── MAIN RENDER ── */
  const isHome = bottomTab === "home";
  return (
    <div style={{
      width: "100%", minHeight: "100vh", background: "#0f1320",
      overflow: "hidden", display: "flex", flexDirection: "column",
      fontFamily: "'DM Sans', 'Segoe UI', 'Roboto', sans-serif",
      position: "relative",
    }} onClick={() => ctx && setCtx(null)}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        @keyframes ctxIn    { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
        @keyframes fadeOverlay { from{opacity:0} to{opacity:1} }
        @keyframes sheetUp  { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes rowIn    { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes notifIn  { 0%{opacity:0;transform:translateX(-50%) translateY(8px)} 14%{opacity:1;transform:translateX(-50%) translateY(0)} 80%{opacity:1} 100%{opacity:0} }
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#2a3355;border-radius:2px}
        input::placeholder{color:#3d4a6a}
        select option{background:#1a2035;color:#c9d1e9}
        * {
          -webkit-tap-highlight-color: transparent;
        }
      `}</style>

      {/* Status bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px 8px", fontSize: 12, color: "#7a8aaa", flexShrink: 0 }}>
        <span style={{ fontWeight: 600 }}>Redmi Note 7 Pro</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>📶</span><span>🔋</span>
        </div>
      </div>

      {/* Page content */}
      {isHome && renderHeader()}
      {isHome && renderMediaTabs()}
      {isHome && renderToolbar()}

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {isHome && <div style={{ flex: 1 }}>{renderFileArea()}</div>}
        {bottomTab === "cloud"    && renderCloud()}
        {bottomTab === "share"    && renderShareTab()}
        {bottomTab === "settings" && renderSettings()}
      </div>

      {isHome && renderStorage()}

      {/* Bottom nav */}
      <div style={{ display: "flex", background: "#0c1020", borderTop: "1px solid #1a1f2e", padding: "10px 0 18px", flexShrink: 0 }}>
        {BOTTOM_TABS.map(t => (
          <button key={t.id} onClick={() => setBottomTab(t.id)} style={{
            flex: 1, background: "none", border: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            fontSize: 10, fontFamily: "inherit", padding: 0,
            color: bottomTab === t.id ? "#4f8ef7" : "#3d4a6a",
            transition: "color .2s",
          }}>
            <span style={{ fontSize: 20 }}>{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Context menu */}
      {ctx && (
        <ContextMenu
          x={ctx.x} y={ctx.y} item={ctx.item}
          onClose={() => setCtx(null)}
          onShare={openShare}
          onRename={item => { setRenaming(item.name); setRenameVal(item.name); setCtx(null); }}
          onDelete={item => { deleteItem(item); setCtx(null); }}
          onProperties={openProps}
        />
      )}

      {/* Sheets */}
      {sheet === "sort"  && renderSortSheet()}
      {sheet === "share" && renderShareSheet()}
      {sheet === "props" && renderPropsSheet()}

      {/* Notification */}
      {notif && <Notification key={notifKey} msg={notif} />}
    </div>
  );
}