import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowRight, Disc3, LoaderCircle, LogIn, LogOut, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { createAlbum, deleteAlbum, getAlbums, getViewer, updateAlbum } from "./lib/api";
import type { Album, AlbumInput, Viewer } from "./types";

const blankForm = {
  artist: "", title: "", released: "", format: "Vinyl" as "Vinyl" | "CD",
  albumScore: 3, artworkScore: 3, paid: "", estimatedValue: "", thoughts: "",
};
const imageLimit = 8 * 1024 * 1024;

function money(value: number) {
  return new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(value);
}

function Score({ value, label }: { value: number; label: string }) {
  return <span className="score" aria-label={`${label}: ${value} out of 5`}>{value.toFixed(value % 1 ? 1 : 0)}<small>/5</small></span>;
}

function AlbumArtwork({ album, className = "" }: { album?: Album; className?: string }) {
  return album
    ? <img className={`album-art ${className}`} src={album.artworkUrl} alt={`Cover artwork for ${album.title} by ${album.artist}`} loading="lazy" />
    : <div className={`art-placeholder ${className}`}><Disc3 size={62} strokeWidth={1} /><span>your next<br />great find</span></div>;
}

function StarRating({ value, onChange, label }: { value: number; onChange: (score: number) => void; label: string }) {
  return <fieldset className="rating-field"><legend>{label}</legend><div className="rating-options">
    {[0, 1, 2, 3, 4, 5].map((score) => <button type="button" key={score} className={value === score ? "rating-option selected" : "rating-option"} onClick={() => onChange(score)} aria-pressed={value === score}>{score}</button>)}
  </div><span className="field-note">0 = not for me · 5 = a keeper</span></fieldset>;
}

export default function App() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [viewer, setViewer] = useState<Viewer>({ signedIn: false, email: null, isAdmin: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState("All formats");
  const [selected, setSelected] = useState<Album | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm);
  const [image, setImage] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    setError("");
    try {
      const [items, account] = await Promise.all([getAlbums(), getViewer()]);
      setAlbums(items);
      setViewer(account);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the record shelf.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!editorOpen && !selected) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]');
    focusable?.[0]?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (editorOpen) setEditorOpen(false);
        else setSelected(null);
      }
      if (event.key === "Tab" && focusable?.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [editorOpen, selected]);

  const filteredAlbums = useMemo(() => albums.filter((album) => {
    const search = `${album.artist} ${album.title} ${album.thoughts}`.toLocaleLowerCase();
    return search.includes(query.toLocaleLowerCase()) && (formatFilter === "All formats" || album.format === formatFilter);
  }), [albums, query, formatFilter]);
  const featured = filteredAlbums[0];

  function openEditor(album?: Album) {
    setError("");
    setEditingId(album?.id ?? null);
    setImage(null);
    setForm(album ? {
      artist: album.artist, title: album.title, released: album.released?.toString() ?? "", format: album.format,
      albumScore: album.albumScore, artworkScore: album.artworkScore, paid: album.paid.toString(),
      estimatedValue: album.estimatedValue.toString(), thoughts: album.thoughts,
    } : blankForm);
    setEditorOpen(true);
  }

  async function readImage(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
    if (file.size > imageLimit) throw new Error("The image must be 8 MB or smaller.");
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") reject(new Error("Could not read the image."));
        else resolve(result.split(",")[1] || "");
      };
      reader.onerror = () => reject(new Error("Could not read the image."));
      reader.readAsDataURL(file);
    });
  }

  async function submitAlbum(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const artwork = image ? { name: image.name, contentType: image.type, base64: await readImage(image) } : undefined;
      const input: AlbumInput = {
        artist: form.artist, title: form.title, released: form.released ? Number(form.released) : null, format: form.format,
        albumScore: form.albumScore, artworkScore: form.artworkScore, paid: Number(form.paid),
        estimatedValue: Number(form.estimatedValue), thoughts: form.thoughts, ...(artwork ? { artwork } : {}),
      };
      const saved = editingId ? await updateAlbum(editingId, input) : await createAlbum(input);
      setEditorOpen(false);
      setSelected(saved);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this album.");
    } finally {
      setSaving(false);
    }
  }

  async function removeAlbum(album: Album) {
    if (!window.confirm(`Remove “${album.title}” by ${album.artist}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await deleteAlbum(album.id);
      setSelected(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove this album.");
    } finally {
      setSaving(false);
    }
  }

  function signIn() {
    if (import.meta.env.DEV) {
      const email = window.prompt("Local preview — enter the configured admin email:");
      if (email) {
        localStorage.setItem("snackamusik-dev-email", email.trim());
        void refresh();
      }
      return;
    }
    window.location.assign("/.auth/login/aad");
  }

  function signOut() {
    if (import.meta.env.DEV) {
      localStorage.removeItem("snackamusik-dev-email");
      void refresh();
      return;
    }
    window.location.assign("/.auth/logout");
  }

  return <div className="site-shell">
    <header className="topbar">
      <a className="wordmark" href="#" aria-label="snackamusik home"><span className="wordmark-icon"><Disc3 size={21} /></span>snacka<span>musik</span><i>.</i></a>
      <nav className="top-nav" aria-label="Main navigation"><a href="#shelf">The collection</a><a href="#about">About the notes</a></nav>
      <div className="account-actions">
        {viewer.isAdmin && <button className="button button-ink" onClick={() => openEditor()}><Plus size={16} /> Add a record</button>}
        {viewer.signedIn
          ? <button className="sign-in" onClick={signOut} title={viewer.email ?? "Sign out"}><LogOut size={16} /><span>Sign out</span></button>
          : <button className="sign-in" onClick={signIn}><LogIn size={16} /><span>Sign in</span></button>}
      </div>
    </header>

    <main>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><span className="eyebrow-dot" /> A PERSONAL RECORD JOURNAL</span>
          <h1>Good music.<br /><em>Great sleeves.</em><br />Worth the spin.</h1>
          <p>Notes from the record shelf: the albums I bring home, the covers I can’t stop looking at, and whether the find was worth it.</p>
          <a className="scroll-link" href="#shelf">Explore the collection <ArrowDown size={15} /></a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-shadow-record"><div className="record-label"><span>SNACKA<br />MUSIK</span><i /></div></div>
          <div className="hero-sleeve"><div className="sleeve-sun" /><span className="sleeve-copy">SIDE A<br /><b>THE GOOD<br />STUFF</b><br />33⅓ RPM</span><span className="sleeve-number">01</span></div>
          <span className="hero-caption">COLLECTED, LISTENED &amp; LOVED</span>
        </div>
        <div className="hero-bottom"><span>EST. 2025</span><span>PLAY IT LOUD · KEEP IT CLOSE</span><span>ISSUE NO. 01</span></div>
      </section>

      <section className="shelf-section" id="shelf">
        <div className="section-heading">
          <div><span className="eyebrow">THE LISTENING LOG</span><h2>From the shelf<span>.</span></h2></div>
          <p>{albums.length ? `${albums.length} ${albums.length === 1 ? "record" : "records"} & counting` : "A growing collection of good finds"}</p>
        </div>
        <div className="filter-row">
          <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an artist or album…" aria-label="Search albums" />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={15} /></button>}</label>
          <div className="format-filters" aria-label="Filter by format">{["All formats", "Vinyl", "CD"].map((format) => <button className={formatFilter === format ? "filter-pill active" : "filter-pill"} key={format} onClick={() => setFormatFilter(format)}>{format}</button>)}</div>
        </div>

        {error && <div className="notice" role="alert">{error}</div>}
        {loading ? <div className="loading-state"><LoaderCircle className="spin" size={24} /> Tuning in…</div>
          : filteredAlbums.length ? <>
            {featured && <article className="featured-record">
              <button className="featured-image-button" onClick={() => setSelected(featured)} aria-label={`Read notes on ${featured.title}`}>
                <AlbumArtwork album={featured} className="featured-image" /><span className="image-stamp">LATEST<br />LISTEN</span>
              </button>
              <div className="featured-copy">
                <span className="eyebrow">LATEST ADDITION <span className="eyebrow-divider">/</span> {featured.format.toUpperCase()}</span>
                <h3>{featured.title}</h3><p className="artist-line">{featured.artist}{featured.released ? <span> · {featured.released}</span> : null}</p>
                <p className="featured-thoughts">{featured.thoughts || "A new entry in the listening log. Give it a spin."}</p>
                <div className="score-pair"><div><small>THE ALBUM</small><Score value={featured.albumScore} label="Album score" /></div><div><small>THE ARTWORK</small><Score value={featured.artworkScore} label="Artwork score" /></div></div>
                <button className="text-link" onClick={() => setSelected(featured)}>Read the full notes <ArrowRight size={15} /></button>
              </div>
            </article>}
            <div className="record-grid">{filteredAlbums.slice(1).map((album, index) => <RecordCard key={album.id} album={album} index={index} onOpen={() => setSelected(album)} />)}</div>
            {filteredAlbums.length === 1 && <p className="single-record-note">More from the shelf, soon.</p>}
          </> : albums.length
            ? <div className="empty-state"><Disc3 size={34} /><h3>No records match those filters.</h3><p>Try another artist or switch up the format.</p><button className="text-link" onClick={() => { setQuery(""); setFormatFilter("All formats"); }}>Clear filters <ArrowRight size={15} /></button></div>
            : <div className="empty-state"><Disc3 size={38} /><h3>The shelf is ready for a first spin.</h3><p>Album notes, cover art and good finds will show up here.</p>{viewer.isAdmin && <button className="button button-ink" onClick={() => openEditor()}><Plus size={16} /> Add the first record</button>}</div>}
      </section>

      <section className="about-strip" id="about"><div className="about-mark"><Disc3 size={25} /></div><div><span className="eyebrow">A NOTE ON THE NOTES</span><p>Personal scores, honest opinions, no skips. The records are mine; the hot takes are too.</p></div><span className="about-side">LISTENING<br />IS PERSONAL</span></section>
    </main>
    <footer className="footer"><a className="wordmark footer-mark" href="#"><span className="wordmark-icon"><Disc3 size={19} /></span>snacka<span>musik</span><i>.</i></a><span>MADE FOR THE LOVE OF THE ALBUM</span><span>© {new Date().getFullYear()}</span></footer>

    {selected && <AlbumDialog album={selected} isAdmin={viewer.isAdmin} onClose={() => setSelected(null)} onEdit={() => { setSelected(null); openEditor(selected); }} onDelete={() => void removeAlbum(selected)} />}
    {editorOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditorOpen(false); }}><section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <div className="modal-top"><div><span className="eyebrow">THE LISTENING LOG</span><h2 id="editor-title">{editingId ? "Edit this record" : "Add a record"}</h2></div><button className="icon-button" onClick={() => setEditorOpen(false)} aria-label="Close editor"><X size={20} /></button></div>
      <form onSubmit={(event) => void submitAlbum(event)} className="album-form">
        <label className="upload-zone"><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] ?? null)} /><span className="upload-icon"><Plus size={20} /></span><strong>{image?.name ?? (editingId ? "Choose new cover art (optional)" : "Add a photo of the sleeve")}</strong><small>JPG, PNG or WebP · up to 8 MB{editingId ? " · leave empty to keep the current image" : ""}</small></label>
        <div className="form-grid"><label className="form-control"><span>Artist</span><input required maxLength={100} value={form.artist} onChange={(event) => setForm({ ...form, artist: event.target.value })} placeholder="e.g. Joni Mitchell" /></label><label className="form-control"><span>Album title</span><input required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Blue" /></label></div>
        <div className="form-grid thirds"><label className="form-control"><span>Format</span><select value={form.format} onChange={(event) => setForm({ ...form, format: event.target.value as "Vinyl" | "CD" })}><option>Vinyl</option><option>CD</option></select></label><label className="form-control"><span>Release year</span><input type="number" min="1900" max={new Date().getFullYear() + 1} value={form.released} onChange={(event) => setForm({ ...form, released: event.target.value })} placeholder="Optional" /></label><label className="form-control"><span>What I paid (SEK)</span><input required type="number" min="0" max="1000000" step="1" value={form.paid} onChange={(event) => setForm({ ...form, paid: event.target.value })} placeholder="0" /></label></div>
        <label className="form-control"><span>What I think it’s worth (SEK)</span><input required type="number" min="0" max="1000000" step="1" value={form.estimatedValue} onChange={(event) => setForm({ ...form, estimatedValue: event.target.value })} placeholder="0" /></label>
        <div className="ratings-row"><StarRating label="The album" value={form.albumScore} onChange={(albumScore) => setForm({ ...form, albumScore })} /><StarRating label="The artwork" value={form.artworkScore} onChange={(artworkScore) => setForm({ ...form, artworkScore })} /></div>
        <label className="form-control"><span>A few words (or a few more)</span><textarea maxLength={3000} rows={5} value={form.thoughts} onChange={(event) => setForm({ ...form, thoughts: event.target.value })} placeholder="What’s the story with this one? How does it sound, feel, look?" /></label>
        {error && <div className="notice" role="alert">{error}</div>}
        <div className="form-actions"><button type="button" className="button button-quiet" onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</button><button type="submit" className="button button-ink" disabled={saving || (!editingId && !image)}>{saving ? <LoaderCircle className="spin" size={16} /> : null}{editingId ? "Save changes" : "Publish record"}</button></div>
      </form>
    </section></div>}
  </div>;
}

function RecordCard({ album, index, onOpen }: { album: Album; index: number; onOpen: () => void }) {
  return <article className="record-card" style={{ "--card-index": index } as React.CSSProperties}>
    <button className="card-image-wrap" onClick={onOpen} aria-label={`Read notes on ${album.title}`}><AlbumArtwork album={album} /><span className="card-format">{album.format}</span><span className="card-open"><ArrowRight size={16} /></span></button>
    <div className="card-details"><span className="card-artist">{album.artist}{album.released ? ` · ${album.released}` : ""}</span><h3><button onClick={onOpen}>{album.title}</button></h3><p>{album.thoughts || "Fresh notes from the record shelf."}</p><div className="card-footer"><span>ALBUM <b>{album.albumScore.toFixed(album.albumScore % 1 ? 1 : 0)}</b></span><span>ARTWORK <b>{album.artworkScore.toFixed(album.artworkScore % 1 ? 1 : 0)}</b></span><button onClick={onOpen} aria-label={`Read ${album.title} notes`}><ArrowRight size={15} /></button></div></div>
  </article>;
}

function AlbumDialog({ album, isAdmin, onClose, onEdit, onDelete }: { album: Album; isAdmin: boolean; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  return <div className="modal-backdrop detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><article className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
    <button className="icon-button detail-close" onClick={onClose} aria-label="Close album notes"><X size={20} /></button><div className="detail-art"><AlbumArtwork album={album} /></div>
    <div className="detail-copy"><span className="eyebrow">{album.format.toUpperCase()} <span className="eyebrow-divider">/</span> {album.released || "RELEASE YEAR UNKNOWN"}</span><h2 id="detail-title">{album.title}</h2><p className="artist-line">{album.artist}</p>
      <p className="detail-thoughts">{album.thoughts || "No extra notes for this one — just press play."}</p>
      <div className="detail-scores"><div><small>THE ALBUM</small><Score value={album.albumScore} label="Album score" /></div><div><small>THE ARTWORK</small><Score value={album.artworkScore} label="Artwork score" /></div></div>
      <div className="value-row"><div><span>PAID</span><strong>{money(album.paid)}</strong></div><span className="value-arrow"><ArrowRight size={15} /></span><div><span>WORTH TO ME</span><strong>{money(album.estimatedValue)}</strong></div></div>
      <div className="detail-date">Added {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(album.createdAt))}</div>
      {isAdmin && <div className="detail-admin"><button className="button button-quiet" onClick={onEdit}><Pencil size={15} /> Edit record</button><button className="button button-delete" onClick={onDelete}><Trash2 size={15} /> Remove</button></div>}
    </div>
  </article></div>;
}
