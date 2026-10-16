import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowRight, Disc3, LoaderCircle, LogIn, LogOut, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { createAlbum, deleteAlbum, getAlbums, getViewer, updateAlbum } from "./lib/api";
import type { Album, AlbumInput, Viewer } from "./types";

const blankForm = {
  artist: "", title: "", released: "", format: "Vinyl" as "Vinyl" | "CD",
  albumScore: 3, artworkScore: 3, favouriteTrack: "", thoughts: "",
};
const imageLimit = 8 * 1024 * 1024;

function Score({ value, label }: { value: number; label: string }) {
  return <span className="score" aria-label={`${label}: ${value} av 5`}>{value.toFixed(value % 1 ? 1 : 0)}<small>/5</small></span>;
}

function AlbumArtwork({ album, className = "" }: { album?: Album; className?: string }) {
  return album
    ? <img className={`album-art ${className}`} src={album.artworkUrl} alt={`Omslaget till ${album.title} av ${album.artist}`} loading="lazy" />
    : <div className={`art-placeholder ${className}`}><Disc3 size={62} strokeWidth={1} /><span>nästa<br />skivfynd</span></div>;
}

function StarRating({ value, onChange, label }: { value: number; onChange: (score: number) => void; label: string }) {
  return <fieldset className="rating-field"><legend>{label}</legend><div className="rating-options">
    {[0, 1, 2, 3, 4, 5].map((score) => <button type="button" key={score} className={value === score ? "rating-option selected" : "rating-option"} onClick={() => onChange(score)} aria-pressed={value === score}>{score}</button>)}
  </div><span className="field-note">0 = inget för mig · 5 = en favorit</span></fieldset>;
}

export default function App() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [viewer, setViewer] = useState<Viewer>({ signedIn: false, email: null, isAdmin: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState("Alla format");
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
      setError(cause instanceof Error ? cause.message : "Det gick inte att hämta skivsamlingen.");
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
    return search.includes(query.toLocaleLowerCase()) && (formatFilter === "Alla format" || album.format === formatFilter);
  }), [albums, query, formatFilter]);
  const featured = filteredAlbums[0];

  function openEditor(album?: Album) {
    setError("");
    setEditingId(album?.id ?? null);
    setImage(null);
    setForm(album ? {
      artist: album.artist, title: album.title, released: album.released?.toString() ?? "", format: album.format,
      albumScore: album.albumScore, artworkScore: album.artworkScore, favouriteTrack: album.favouriteTrack,
      thoughts: album.thoughts,
    } : blankForm);
    setEditorOpen(true);
  }

  async function readImage(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Välj en JPG-, PNG- eller WebP-bild.");
    if (file.size > imageLimit) throw new Error("Bilden får vara högst 8 MB.");
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") reject(new Error("Det gick inte att läsa bilden."));
        else resolve(result.split(",")[1] || "");
      };
      reader.onerror = () => reject(new Error("Det gick inte att läsa bilden."));
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
        albumScore: form.albumScore, artworkScore: form.artworkScore, favouriteTrack: form.favouriteTrack,
        thoughts: form.thoughts, ...(artwork ? { artwork } : {}),
      };
      const saved = editingId ? await updateAlbum(editingId, input) : await createAlbum(input);
      setEditorOpen(false);
      setSelected(saved);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Det gick inte att spara skivan.");
    } finally {
      setSaving(false);
    }
  }

  async function removeAlbum(album: Album) {
    if (!window.confirm(`Ta bort ”${album.title}” av ${album.artist}? Åtgärden går inte att ångra.`)) return;
    setSaving(true);
    try {
      await deleteAlbum(album.id);
      setSelected(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Det gick inte att ta bort skivan.");
    } finally {
      setSaving(false);
    }
  }

  function signIn() {
    if (import.meta.env.DEV) {
      const email = window.prompt("Lokal förhandsvisning – ange administratörens e-postadress:");
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
      <a className="wordmark" href="#" aria-label="snackamusik – startsida"><span className="wordmark-icon"><Disc3 size={21} /></span>snacka<span>musik</span><i>.</i></a>
      <nav className="top-nav" aria-label="Huvudmeny"><a href="#shelf">Skivsamlingen</a><a href="#about">Om anteckningarna</a></nav>
      <div className="account-actions">
        {viewer.isAdmin && <button className="button button-ink" onClick={() => openEditor()}><Plus size={16} /> Lägg till en skiva</button>}
        {viewer.signedIn
          ? <button className="sign-in" onClick={signOut} title={viewer.email ?? "Logga ut"}><LogOut size={16} /><span>Logga ut</span></button>
          : <button className="sign-in" onClick={signIn}><LogIn size={16} /><span>Logga in</span></button>}
      </div>
    </header>

    <main>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><span className="eyebrow-dot" /> EN PERSONLIG SKIVDAGBOK</span>
          <h1>Bra musik.<br /><em>Snygga omslag.</em><br />Värda ett varv.</h1>
          <p>Anteckningar från skivhyllan: albumen jag tar med mig hem, omslagen jag inte kan sluta titta på och låtarna jag återvänder till.</p>
          <a className="scroll-link" href="#shelf">Utforska samlingen <ArrowDown size={15} /></a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-shadow-record"><div className="record-label"><span>SNACKA<br />MUSIK</span><i /></div></div>
          <div className="hero-sleeve"><div className="sleeve-sun" /><span className="sleeve-copy">SIDA A<br /><b>DET BÄSTA<br />JUST NU</b><br />33⅓ VARV/MIN</span><span className="sleeve-number">01</span></div>
          <span className="hero-caption">SAMLAT, LYSSNAT PÅ &amp; ÄLSKAT</span>
        </div>
        <div className="hero-bottom"><span>SEDAN 2025</span><span>SPELA HÖGT · HÅLL KÄRT</span><span>NUMMER 01</span></div>
      </section>

      <section className="shelf-section" id="shelf">
        <div className="section-heading">
          <div><span className="eyebrow">LYSSNINGSLOGGEN</span><h2>Från skivhyllan<span>.</span></h2></div>
          <p>{albums.length ? `${albums.length} ${albums.length === 1 ? "skiva" : "skivor"} och fler lär det bli` : "En samling fina skivfynd växer fram"}</p>
        </div>
        <div className="filter-row">
          <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök artist eller album…" aria-label="Sök bland album" />{query && <button onClick={() => setQuery("")} aria-label="Rensa sökning"><X size={15} /></button>}</label>
          <div className="format-filters" aria-label="Filtrera efter format">{["Alla format", "Vinyl", "CD"].map((format) => <button className={formatFilter === format ? "filter-pill active" : "filter-pill"} key={format} onClick={() => setFormatFilter(format)}>{format}</button>)}</div>
        </div>

        {error && <div className="notice" role="alert">{error}</div>}
        {loading ? <div className="loading-state"><LoaderCircle className="spin" size={24} /> Ställer in frekvensen…</div>
          : filteredAlbums.length ? <>
            {featured && <article className="featured-record">
              <button className="featured-image-button" onClick={() => setSelected(featured)} aria-label={`Läs anteckningarna om ${featured.title}`}>
                <AlbumArtwork album={featured} className="featured-image" /><span className="image-stamp">SENASTE<br />LYSSNINGEN</span>
              </button>
              <div className="featured-copy">
                <span className="eyebrow">SENASTE TILLSKOTTET <span className="eyebrow-divider">/</span> {featured.format.toUpperCase()}</span>
                <h3>{featured.title}</h3><p className="artist-line">{featured.artist}{featured.released ? <span> · {featured.released}</span> : null}</p>
                <p className="featured-thoughts">{featured.thoughts || "En ny anteckning i lyssningsloggen. Dags att lägga på skivan."}</p>
                <div className="score-pair"><div><small>ALBUMET</small><Score value={featured.albumScore} label="Albumbetyg" /></div><div><small>OMSLAGET</small><Score value={featured.artworkScore} label="Omslagsbetyg" /></div></div>
                <button className="text-link" onClick={() => setSelected(featured)}>Läs hela anteckningen <ArrowRight size={15} /></button>
              </div>
            </article>}
            <div className="record-grid">{filteredAlbums.slice(1).map((album, index) => <RecordCard key={album.id} album={album} index={index} onOpen={() => setSelected(album)} />)}</div>
            {filteredAlbums.length === 1 && <p className="single-record-note">Fler skivor från hyllan kommer snart.</p>}
          </> : albums.length
            ? <div className="empty-state"><Disc3 size={34} /><h3>Inga skivor matchar filtreringen.</h3><p>Prova en annan artist eller välj ett annat format.</p><button className="text-link" onClick={() => { setQuery(""); setFormatFilter("Alla format"); }}>Rensa filtreringen <ArrowRight size={15} /></button></div>
            : <div className="empty-state"><Disc3 size={38} /><h3>Skivhyllan väntar på sin första skiva.</h3><p>Här samlas album, omslag och fina fynd.</p>{viewer.isAdmin && <button className="button button-ink" onClick={() => openEditor()}><Plus size={16} /> Lägg till den första skivan</button>}</div>}
      </section>

      <section className="about-strip" id="about"><div className="about-mark"><Disc3 size={25} /></div><div><span className="eyebrow">OM ANTECKNINGARNA</span><p>Personliga betyg och ärliga åsikter – inga överhoppade spår. Skivorna är mina, och det är åsikterna också.</p></div><span className="about-side">LYSSNANDET<br />ÄR PERSONLIGT</span></section>
    </main>
    <footer className="footer"><a className="wordmark footer-mark" href="#"><span className="wordmark-icon"><Disc3 size={19} /></span>snacka<span>musik</span><i>.</i></a><span>SKAPAD AV KÄRLEK TILL ALBUMET</span><span>© {new Date().getFullYear()}</span></footer>

    {selected && <AlbumDialog album={selected} isAdmin={viewer.isAdmin} onClose={() => setSelected(null)} onEdit={() => { setSelected(null); openEditor(selected); }} onDelete={() => void removeAlbum(selected)} />}
    {editorOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditorOpen(false); }}><section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <div className="modal-top"><div><span className="eyebrow">LYSSNINGSLOGGEN</span><h2 id="editor-title">{editingId ? "Redigera skivan" : "Lägg till en skiva"}</h2></div><button className="icon-button" onClick={() => setEditorOpen(false)} aria-label="Stäng redigeraren"><X size={20} /></button></div>
      <form onSubmit={(event) => void submitAlbum(event)} className="album-form">
        <label className="upload-zone"><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] ?? null)} /><span className="upload-icon"><Plus size={20} /></span><strong>{image?.name ?? (editingId ? "Välj ett nytt omslag (valfritt)" : "Lägg till ett foto av omslaget")}</strong><small>JPG, PNG eller WebP · högst 8 MB{editingId ? " · lämna tomt för att behålla den nuvarande bilden" : ""}</small></label>
        <div className="form-grid"><label className="form-control"><span>Artist</span><input required maxLength={100} value={form.artist} onChange={(event) => setForm({ ...form, artist: event.target.value })} placeholder="t.ex. Joni Mitchell" /></label><label className="form-control"><span>Albumtitel</span><input required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="t.ex. Blue" /></label></div>
        <div className="form-grid thirds"><label className="form-control"><span>Format</span><select value={form.format} onChange={(event) => setForm({ ...form, format: event.target.value as "Vinyl" | "CD" })}><option>Vinyl</option><option>CD</option></select></label><label className="form-control"><span>Utgivningsår</span><input type="number" min="1900" max={new Date().getFullYear() + 1} value={form.released} onChange={(event) => setForm({ ...form, released: event.target.value })} placeholder="Valfritt" /></label><label className="form-control"><span>Favoritlåt</span><input maxLength={200} value={form.favouriteTrack} onChange={(event) => setForm({ ...form, favouriteTrack: event.target.value })} placeholder="Valfritt" /></label></div>
        <div className="ratings-row"><StarRating label="Albumet" value={form.albumScore} onChange={(albumScore) => setForm({ ...form, albumScore })} /><StarRating label="Omslaget" value={form.artworkScore} onChange={(artworkScore) => setForm({ ...form, artworkScore })} /></div>
        <label className="form-control"><span>Några ord (eller några till)</span><textarea maxLength={3000} rows={5} value={form.thoughts} onChange={(event) => setForm({ ...form, thoughts: event.target.value })} placeholder="Vad är historien bakom skivan? Hur låter, känns och ser den ut?" /></label>
        {error && <div className="notice" role="alert">{error}</div>}
        <div className="form-actions"><button type="button" className="button button-quiet" onClick={() => setEditorOpen(false)} disabled={saving}>Avbryt</button><button type="submit" className="button button-ink" disabled={saving || (!editingId && !image)}>{saving ? <LoaderCircle className="spin" size={16} /> : null}{editingId ? "Spara ändringar" : "Publicera skivan"}</button></div>
      </form>
    </section></div>}
  </div>;
}

function RecordCard({ album, index, onOpen }: { album: Album; index: number; onOpen: () => void }) {
  return <article className="record-card" style={{ "--card-index": index } as React.CSSProperties}>
    <button className="card-image-wrap" onClick={onOpen} aria-label={`Läs anteckningarna om ${album.title}`}><AlbumArtwork album={album} /><span className="card-format">{album.format}</span><span className="card-open"><ArrowRight size={16} /></span></button>
    <div className="card-details"><span className="card-artist">{album.artist}{album.released ? ` · ${album.released}` : ""}</span><h3><button onClick={onOpen}>{album.title}</button></h3><p>{album.thoughts || "Nya anteckningar från skivhyllan."}</p><div className="card-footer"><span>ALBUM <b>{album.albumScore.toFixed(album.albumScore % 1 ? 1 : 0)}</b></span><span>OMSLAG <b>{album.artworkScore.toFixed(album.artworkScore % 1 ? 1 : 0)}</b></span><button onClick={onOpen} aria-label={`Läs anteckningarna om ${album.title}`}><ArrowRight size={15} /></button></div></div>
  </article>;
}

function AlbumDialog({ album, isAdmin, onClose, onEdit, onDelete }: { album: Album; isAdmin: boolean; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  return <div className="modal-backdrop detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><article className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
    <button className="icon-button detail-close" onClick={onClose} aria-label="Stäng anteckningarna"><X size={20} /></button><div className="detail-art"><AlbumArtwork album={album} /></div>
    <div className="detail-copy"><span className="eyebrow">{album.format.toUpperCase()} <span className="eyebrow-divider">/</span> {album.released || "OKÄNT UTGIVNINGSÅR"}</span><h2 id="detail-title">{album.title}</h2><p className="artist-line">{album.artist}</p>
      <p className="detail-thoughts">{album.thoughts || "Inga fler anteckningar om den här – det är bara att lägga på skivan."}</p>
      <div className="detail-scores"><div><small>ALBUMET</small><Score value={album.albumScore} label="Albumbetyg" /></div><div><small>OMSLAGET</small><Score value={album.artworkScore} label="Omslagsbetyg" /></div></div>
      {album.favouriteTrack && <div className="value-row"><div><span>FAVORITLÅT</span><strong>{album.favouriteTrack}</strong></div></div>}
      <div className="detail-date">Tillagd {new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", year: "numeric" }).format(new Date(album.createdAt))}</div>
      {isAdmin && <div className="detail-admin"><button className="button button-quiet" onClick={onEdit}><Pencil size={15} /> Redigera skivan</button><button className="button button-delete" onClick={onDelete}><Trash2 size={15} /> Ta bort</button></div>}
    </div>
  </article></div>;
}
