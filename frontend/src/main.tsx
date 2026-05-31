import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Edit3, LogOut, Search, Shield, Trash2, Upload, UserPlus, Users, Vault } from "lucide-react";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8084";

const COMIC_IMPORT_HEADERS =
  "name, number, Date, Volume, direct, Publisher, no. of books, print, print ratio, Cover, variant, writer, artist, Pencils, inker, cover artist, average price, price paid, buy date, sell date, point of purchase, signed, remarked, notes";

type ComicFormField = {
  key: string;
  label: string;
  type?: "number" | "textarea";
};

const COMIC_FORM_FIELDS: ComicFormField[] = [
  { key: "name", label: "Name" },
  { key: "number", label: "Number" },
  { key: "date", label: "Date" },
  { key: "volume", label: "Volume" },
  { key: "direct", label: "Direct" },
  { key: "publisher", label: "Publisher" },
  { key: "numberOfBooks", label: "No. of books" },
  { key: "print", label: "Print" },
  { key: "printRatio", label: "Print ratio" },
  { key: "cover", label: "Cover" },
  { key: "variant", label: "Variant" },
  { key: "writer", label: "Writer" },
  { key: "artist", label: "Artist" },
  { key: "pencils", label: "Pencils" },
  { key: "inker", label: "Inker" },
  { key: "coverArtist", label: "Cover artist" },
  { key: "averagePrice", label: "Average price", type: "number" },
  { key: "pricePaid", label: "Price paid", type: "number" },
  { key: "buyDate", label: "Buy date" },
  { key: "sellDate", label: "Sell date" },
  { key: "pointOfPurchase", label: "Point of purchase" },
  { key: "signed", label: "Signed" },
  { key: "remarked", label: "Remarked" },
  { key: "notes", label: "Notes", type: "textarea" }
];

type Role = "ADMIN" | "USER";

type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt?: string;
};

type Comic = {
  id: string;
  name?: string | null;
  number?: string | null;
  date?: string | null;
  volume?: string | null;
  direct?: string | null;
  publisher?: string | null;
  numberOfBooks?: string | null;
  print?: string | null;
  printRatio?: string | null;
  cover?: string | null;
  variant?: string | null;
  writer?: string | null;
  artist?: string | null;
  pencils?: string | null;
  inker?: string | null;
  coverArtist?: string | null;
  coverImageUrl?: string | null;
  averagePrice?: string | number | null;
  pricePaid?: string | number | null;
  buyDate?: string | null;
  sellDate?: string | null;
  pointOfPurchase?: string | null;
  signed?: string | null;
  remarked?: string | null;
  notes?: string | null;
};

type ComicDraft = Omit<Comic, "id">;
type SearchResult = {
  source: "comicvine";
  sourceId: string;
  displayTitle: string;
  coverImageUrl?: string;
} & ComicDraft;
type ImportRow = Record<string, unknown>;
type ImportResult = { imported: number; skipped: number; errors: { row: number; message: string }[] };
type RefreshResult = { updated: number; skipped: number; total: number };

const emptyComic: ComicDraft = {
  name: "",
  number: "",
  date: "",
  volume: "",
  direct: "",
  publisher: "",
  numberOfBooks: "",
  print: "",
  printRatio: "",
  cover: "",
  variant: "",
  writer: "",
  artist: "",
  pencils: "",
  inker: "",
  coverArtist: "",
  coverImageUrl: "",
  averagePrice: "",
  pricePaid: "",
  buyDate: "",
  sellDate: "",
  pointOfPurchase: "",
  signed: "",
  remarked: "",
  notes: ""
};

function currency(value: string | number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value ?? 0));
}

function comicDisplayName(comic: Pick<Comic, "name" | "number" | "volume">) {
  const issue = comic.number ? `#${comic.number}` : "";
  return [comic.name, issue, comic.volume].filter(Boolean).join(" ") || "Untitled comic";
}

function sortComicsAlphabetically(comics: Comic[]) {
  return [...comics].sort((left, right) => {
    const nameCompare = (left.name ?? "").localeCompare(right.name ?? "", undefined, { sensitivity: "base" });
    if (nameCompare !== 0) return nameCompare;
    const numberCompare = (left.number ?? "").localeCompare(right.number ?? "", undefined, { numeric: true, sensitivity: "base" });
    if (numberCompare !== 0) return numberCompare;
    return (left.volume ?? "").localeCompare(right.volume ?? "", undefined, { sensitivity: "base" });
  });
}

type PriceIndexPoint = {
  label: string;
  cumulativePaid: number;
  cumulativeAverage: number;
  priceIndex: number;
};

function buildPriceIndex(comics: Comic[]): PriceIndexPoint[] {
  let cumulativePaid = 0;
  let cumulativeAverage = 0;

  return sortComicsAlphabetically(comics).map((comic) => {
    cumulativePaid += Number(comic.pricePaid ?? 0);
    cumulativeAverage += Number(comic.averagePrice ?? 0);
    const priceIndex = cumulativePaid > 0 ? (cumulativeAverage / cumulativePaid) * 100 : 100;
    return {
      label: comicDisplayName(comic),
      cumulativePaid,
      cumulativeAverage,
      priceIndex
    };
  });
}

function PriceIndexChart({ comics }: { comics: Comic[] }) {
  const points = useMemo(() => buildPriceIndex(comics), [comics]);
  if (!points.length) {
    return (
      <section className="panel price-index-panel">
        <h2>Collection price index</h2>
        <p className="muted">Import or add comics to see your collection value chart.</p>
      </section>
    );
  }

  const width = 960;
  const height = 280;
  const pad = { top: 24, right: 24, bottom: 48, left: 64 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const maxValue = Math.max(
    ...points.map((point) => point.cumulativeAverage),
    ...points.map((point) => point.cumulativePaid),
    1
  );
  const maxIndex = Math.max(...points.map((point) => point.priceIndex), 100);
  const minIndex = Math.min(...points.map((point) => point.priceIndex), 100);

  const xStep = points.length > 1 ? chartWidth / (points.length - 1) : 0;
  const xAt = (index: number) => pad.left + (points.length > 1 ? index * xStep : chartWidth / 2);
  const yValue = (value: number) => pad.top + chartHeight - (value / maxValue) * chartHeight;
  const yIndex = (value: number) => {
    const span = maxIndex - minIndex || 1;
    return pad.top + chartHeight - ((value - minIndex) / span) * chartHeight;
  };

  const linePath = (values: number[], scale: (value: number) => number) =>
    points.map((_, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(1)} ${scale(values[index]).toFixed(1)}`).join(" ");

  const paidPath = linePath(
    points.map((point) => point.cumulativePaid),
    yValue
  );
  const averagePath = linePath(
    points.map((point) => point.cumulativeAverage),
    yValue
  );
  const indexPath = linePath(
    points.map((point) => point.priceIndex),
    yIndex
  );

  const yTicks = 4;
  const valueTicks = Array.from({ length: yTicks + 1 }, (_, index) => (maxValue / yTicks) * index);
  const indexTicks = Array.from({ length: yTicks + 1 }, (_, index) => minIndex + ((maxIndex - minIndex) / yTicks) * index);
  const labelStride = Math.max(1, Math.ceil(points.length / 8));

  return (
    <section className="panel price-index-panel">
      <div className="price-index-header">
        <h2>Collection price index</h2>
        <div className="price-index-legend">
          <span className="legend-item paid">Cumulative paid</span>
          <span className="legend-item average">Cumulative average value</span>
          <span className="legend-item index">Price index (avg / paid × 100)</span>
        </div>
      </div>
      <svg className="price-index-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Collection price index chart">
        {valueTicks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={yValue(tick)} y2={yValue(tick)} className="chart-grid" />
            <text x={pad.left - 10} y={yValue(tick) + 4} className="chart-axis-label" textAnchor="end">
              {currency(tick)}
            </text>
          </g>
        ))}
        {indexTicks.map((tick) => (
          <text key={`index-${tick}`} x={width - pad.right + 8} y={yIndex(tick) + 4} className="chart-axis-label index-axis" textAnchor="start">
            {tick.toFixed(0)}
          </text>
        ))}
        <path d={paidPath} className="chart-line paid" fill="none" />
        <path d={averagePath} className="chart-line average" fill="none" />
        <path d={indexPath} className="chart-line index" fill="none" />
        {points.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle cx={xAt(index)} cy={yValue(point.cumulativeAverage)} r="3.5" className="chart-dot average">
              <title>{`${point.label}\nAverage total: ${currency(point.cumulativeAverage)}\nPaid total: ${currency(point.cumulativePaid)}\nIndex: ${point.priceIndex.toFixed(1)}`}</title>
            </circle>
            {index % labelStride === 0 || index === points.length - 1 ? (
              <text x={xAt(index)} y={height - 16} className="chart-axis-label" textAnchor="middle">
                {index + 1}
              </text>
            ) : null}
          </g>
        ))}
        <text x={width / 2} y={height - 2} className="chart-axis-title" textAnchor="middle">
          Comics in alphabetical order
        </text>
      </svg>
    </section>
  );
}

function comicPriceSearchLabel(comic: ComicDraft) {
  const issue = comic.number ? `#${comic.number}` : "";
  return [comic.name, issue, comic.volume, comic.publisher].filter(Boolean).join(" ").trim();
}

function normalizeDraftForSave(draft: ComicDraft): ComicDraft {
  const next: Record<string, string | number | null | undefined> = { ...draft };
  for (const field of COMIC_FORM_FIELDS) {
    const value = next[field.key];
    if (field.type === "number") {
      next[field.key] = value === "" || value == null ? null : Number(value);
    } else if (value === "") {
      next[field.key] = null;
    }
  }
  return next as ComicDraft;
}

function draftFromComic(comic: Comic): ComicDraft {
  const draft: Record<string, string | number | null | undefined> = { ...emptyComic };
  for (const field of COMIC_FORM_FIELDS) {
    const value = comic[field.key as keyof Comic];
    draft[field.key] =
      field.type === "number" ? (value == null || value === "" ? "" : Number(value)) : (value ?? "");
  }
  return draft as ComicDraft;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseCsv(text: string): ImportRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    throw new Error("CSV needs a header row and at least one data row.");
  }

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<ImportRow>((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
}

function parseImportFile(text: string, filename: string): ImportRow[] {
  const lowerName = filename.toLowerCase();
  if (lowerName.endsWith(".json")) {
    const data = JSON.parse(text) as unknown;
    if (Array.isArray(data)) return data as ImportRow[];
    if (data && typeof data === "object" && Array.isArray((data as { comics?: unknown }).comics)) {
      return (data as { comics: ImportRow[] }).comics;
    }
    throw new Error("JSON must be an array or { comics: [...] }.");
  }

  if (lowerName.endsWith(".csv")) return parseCsv(text);
  throw new Error("Use a .csv or .json file.");
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("comicvault-token") ?? "");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const oauthToken = url.searchParams.get("token");
    if (oauthToken) {
      localStorage.setItem("comicvault-token", oauthToken);
      setToken(oauthToken);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    api<{ user: User }>("/auth/me", token)
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem("comicvault-token");
        setToken("");
      });
  }, [token]);

  function onSignedIn(nextToken: string, nextUser: User) {
    localStorage.setItem("comicvault-token", nextToken);
    setToken(nextToken);
    setUser(nextUser);
  }

  function signOut() {
    localStorage.removeItem("comicvault-token");
    setToken("");
    setUser(null);
  }

  if (!token || !user) return <AuthScreen onSignedIn={onSignedIn} />;

  return <VaultApp token={token} user={user} onSignOut={signOut} />;
}

function AuthScreen({ onSignedIn }: { onSignedIn: (token: string, user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const data = await api<{ token: string; user: User }>(`/auth/${mode}`, undefined, {
        method: "POST",
        body: JSON.stringify(form)
      });
      onSignedIn(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-mark">
          <Vault size={30} />
          <span>Comic Vault</span>
        </div>
        <h1>{mode === "login" ? "Welcome back" : "Create your vault"}</h1>
        <form onSubmit={submit} className="stack">
          {mode === "register" && (
            <label>
              Name
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
          )}
          <label>
            Email
            <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          </label>
          <label>
            Password
            <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required minLength={8} />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit">{mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <a className="google-link" href={`${API_BASE}/auth/google`}>Sign in with Google</a>
        <button className="text-button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Need an account?" : "Already have an account?"}
        </button>
      </section>
    </main>
  );
}

function VaultApp({ token, user, onSignOut }: { token: string; user: User; onSignOut: () => void }) {
  const [comics, setComics] = useState<Comic[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<ComicDraft>(emptyComic);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [internetQuery, setInternetQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeTab, setActiveTab] = useState<"vault" | "admin">("vault");
  const [message, setMessage] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [refreshingCovers, setRefreshingCovers] = useState(false);

  const sortedComics = useMemo(() => sortComicsAlphabetically(comics), [comics]);

  const totals = useMemo(() => {
    const averageValue = comics.reduce((sum, comic) => sum + Number(comic.averagePrice ?? 0), 0);
    const paidValue = comics.reduce((sum, comic) => sum + Number(comic.pricePaid ?? 0), 0);
    return { averageValue, paidValue, gain: averageValue - paidValue };
  }, [comics]);

  useEffect(() => {
    loadComics();
  }, [token, query]);

  async function loadComics() {
    const path = query ? `/comics?q=${encodeURIComponent(query)}` : "/comics";
    setComics(await api<Comic[]>(path, token));
  }

  async function searchInternet() {
    setMessage("");
    const found = await api<SearchResult[]>(`/search/comics?q=${encodeURIComponent(internetQuery)}`, token);
    setResults(found);
    if (!found.length) setMessage("No online matches found yet. Add API keys or enter the comic manually.");
  }

  async function estimatePrice(nextDraft = draft) {
    const label = comicPriceSearchLabel(nextDraft);
    if (label.length < 2) {
      setMessage("Add a name (and ideally number or publisher) before fetching average price.");
      return;
    }

    try {
      setMessage("");
      const data = await api<{ price: number | null; message?: string }>(`/search/price?q=${encodeURIComponent(label)}`, token);
      if (data.price == null) {
        setMessage(data.message ?? "No average price found for that comic.");
        return;
      }
      setDraft((current) => ({ ...current, averagePrice: data.price ?? "" }));
      setMessage(`Average price: ${currency(data.price)}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Average price lookup failed.");
    }
  }

  async function saveComic(event: FormEvent) {
    event.preventDefault();
    const path = editingId ? `/comics/${editingId}` : "/comics";
    const payload = normalizeDraftForSave(draft);
    await api(path, token, { method: editingId ? "PUT" : "POST", body: JSON.stringify(payload) });
    setDraft(emptyComic);
    setEditingId(null);
    setResults([]);
    await loadComics();
  }

  async function deleteComic(id: string) {
    await api(`/comics/${id}`, token, { method: "DELETE" });
    await loadComics();
  }

  async function importComics(file: File) {
    setImportMessage("");
    setImporting(true);
    try {
      const rows = parseImportFile(await file.text(), file.name);
      const result = await api<ImportResult>("/comics/import", token, {
        method: "POST",
        body: JSON.stringify({ comics: rows })
      });
      await loadComics();
      const errorNote = result.errors.length
        ? ` ${result.errors.length} row${result.errors.length === 1 ? "" : "s"} skipped.`
        : "";
      setImportMessage(`Imported ${result.imported} comic${result.imported === 1 ? "" : "s"}.${errorNote}`);
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  async function refreshAllPrices() {
    setImportMessage("");
    setRefreshingPrices(true);
    try {
      const result = await api<RefreshResult>("/comics/refresh-prices", token, { method: "POST" });
      await loadComics();
      setImportMessage(`Updated average price for ${result.updated} of ${result.total} comics.${result.skipped ? ` ${result.skipped} skipped.` : ""}`);
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : "Average price refresh failed.");
    } finally {
      setRefreshingPrices(false);
    }
  }

  async function refreshAllCovers() {
    setImportMessage("");
    setRefreshingCovers(true);
    try {
      const result = await api<RefreshResult>("/comics/refresh-covers", token, { method: "POST" });
      await loadComics();
      setImportMessage(`Fetched cover images for ${result.updated} of ${result.total} comics.${result.skipped ? ` ${result.skipped} skipped.` : ""}`);
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : "Cover image refresh failed.");
    } finally {
      setRefreshingCovers(false);
    }
  }

  function editComic(comic: Comic) {
    setEditingId(comic.id);
    setDraft(draftFromComic(comic));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function useResult(result: SearchResult) {
    const nextDraft = {
      ...emptyComic,
      name: result.name ?? "",
      number: result.number ?? "",
      date: result.date ?? "",
      volume: result.volume ?? "",
      publisher: result.publisher ?? "",
      writer: result.writer ?? "",
      artist: result.artist ?? "",
      pencils: result.pencils ?? "",
      inker: result.inker ?? "",
      coverArtist: result.coverArtist ?? "",
      coverImageUrl: result.coverImageUrl ?? ""
    };
    setDraft(nextDraft);
    estimatePrice(nextDraft);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">
          <Vault size={28} />
          <span>Comic Vault</span>
        </div>
        <div className="top-actions">
          <span>{user.name}</span>
          {user.role === "ADMIN" && (
            <button className={activeTab === "admin" ? "icon-button active" : "icon-button"} onClick={() => setActiveTab(activeTab === "admin" ? "vault" : "admin")} title="Admin">
              <Shield size={18} />
            </button>
          )}
          <button className="icon-button" onClick={onSignOut} title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {activeTab === "admin" ? (
        <AdminPanel token={token} />
      ) : (
        <>
          <PriceIndexChart comics={comics} />

          <section className="dashboard">
            <Stat label="Books" value={String(comics.length)} />
            <Stat label="Average value" value={currency(totals.averageValue)} />
            <Stat label="Paid" value={currency(totals.paidValue)} />
            <Stat label="Difference" value={currency(totals.gain)} />
          </section>

          <div className="inventory-toolbar">
            <button className="secondary" type="button" onClick={refreshAllPrices} disabled={refreshingPrices || !comics.length}>
              {refreshingPrices ? "Refreshing prices..." : "Refresh average prices"}
            </button>
            <button className="secondary" type="button" onClick={refreshAllCovers} disabled={refreshingCovers || !comics.length}>
              {refreshingCovers ? "Fetching covers..." : "Fetch cover images"}
            </button>
          </div>

          <section className="workspace">
            <div className="panel form-panel">
              <h2>{editingId ? "Edit comic" : "Add comic"}</h2>
              <div className="search-row">
                <input placeholder="Search the internet for a comic" value={internetQuery} onChange={(event) => setInternetQuery(event.target.value)} />
                <button className="icon-button filled" onClick={searchInternet} title="Search online">
                  <Search size={18} />
                </button>
              </div>
              {message && <p className="muted">{message}</p>}
              {results.length > 0 && (
                <div className="result-list">
                  {results.map((result) => (
                    <button key={result.sourceId} onClick={() => useResult(result)}>
                      {result.coverImageUrl && <img src={result.coverImageUrl} alt="" />}
                      <span>{result.displayTitle}</span>
                    </button>
                  ))}
                </div>
              )}
              <ComicForm draft={draft} setDraft={setDraft} onSubmit={saveComic} onEstimate={() => estimatePrice()} editing={Boolean(editingId)} />
            </div>

            <div className="panel inventory-panel">
              <div className="inventory-header">
                <h2>Your inventory</h2>
                <div className="inventory-actions">
                  <ImportButton importing={importing} onImport={importComics} />
                  <div className="search-row inventory-search">
                    <Search size={18} />
                    <input placeholder="Search your vault" value={query} onChange={(event) => setQuery(event.target.value)} />
                  </div>
                </div>
              </div>
              {importMessage && <p className="import-message">{importMessage}</p>}
              <p className="import-hint muted">CSV or JSON columns: {COMIC_IMPORT_HEADERS}</p>
              <div className="comic-grid">
                {sortedComics.map((comic) => (
                  <article className="comic-card" key={comic.id}>
                    <div className="cover-frame">
                      {comic.coverImageUrl ? <img src={comic.coverImageUrl} alt="" /> : <Vault size={48} />}
                    </div>
                    <div className="comic-body">
                      <h3>{comicDisplayName(comic)}</h3>
                      <p>{comic.publisher || "Publisher pending"}</p>
                      <p>{[comic.writer, comic.artist].filter(Boolean).join(" / ") || "Creator details pending"}</p>
                      <div className="price-row">
                        <span>{currency(comic.averagePrice)}</span>
                        <small>paid {currency(comic.pricePaid)}</small>
                      </div>
                      <div className="card-actions">
                        <button className="icon-button" onClick={() => editComic(comic)} title="Edit comic">
                          <Edit3 size={17} />
                        </button>
                        <button className="icon-button danger" onClick={() => deleteComic(comic.id)} title="Delete comic">
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function ImportButton({ importing, onImport }: { importing: boolean; onImport: (file: File) => void }) {
  const inputId = "comic-import-file";

  return (
    <>
      <input
        id={inputId}
        className="import-input"
        type="file"
        accept=".csv,.json,application/json,text/csv"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImport(file);
          event.target.value = "";
        }}
      />
      <label className="import-button" htmlFor={inputId} title="Import CSV or JSON">
        <Upload size={18} />
        <span>{importing ? "Importing..." : "Import"}</span>
      </label>
    </>
  );
}

function ComicForm({ draft, setDraft, onSubmit, onEstimate, editing }: { draft: ComicDraft; setDraft: (draft: ComicDraft) => void; onSubmit: (event: FormEvent) => void; onEstimate: () => void; editing: boolean }) {
  const set = (key: keyof ComicDraft, value: string | number) => setDraft({ ...draft, [key]: value });

  return (
    <form className="comic-form" onSubmit={onSubmit}>
      {COMIC_FORM_FIELDS.map((field) => {
        const value = draft[field.key as keyof ComicDraft] ?? "";
        if (field.type === "textarea") {
          return (
            <label key={field.key}>
              {field.label}
              <textarea value={String(value)} onChange={(event) => set(field.key as keyof ComicDraft, event.target.value)} rows={3} />
            </label>
          );
        }
        if (field.type === "number") {
          return (
            <label key={field.key}>
              {field.label}
              <input type="number" min="0" step="0.01" value={value === null ? "" : value} onChange={(event) => set(field.key as keyof ComicDraft, event.target.value)} />
            </label>
          );
        }
        return (
          <label key={field.key}>
            {field.label}
            <input value={String(value)} onChange={(event) => set(field.key as keyof ComicDraft, event.target.value)} />
          </label>
        );
      })}
      <div className="form-actions">
        <button className="secondary" type="button" onClick={onEstimate}>Fetch average price</button>
        <button className="primary" type="submit">{editing ? "Save changes" : "Add book"}</button>
      </div>
    </form>
  );
}

function AdminPanel({ token }: { token: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [draft, setDraft] = useState({ id: "", name: "", email: "", password: "", role: "USER" as Role });

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setUsers(await api<User[]>("/users", token));
  }

  async function saveUser(event: FormEvent) {
    event.preventDefault();
    const path = draft.id ? `/users/${draft.id}` : "/users";
    await api(path, token, { method: draft.id ? "PUT" : "POST", body: JSON.stringify(draft) });
    setDraft({ id: "", name: "", email: "", password: "", role: "USER" });
    await loadUsers();
  }

  async function deleteUser(id: string) {
    await api(`/users/${id}`, token, { method: "DELETE" });
    await loadUsers();
  }

  return (
    <section className="admin-layout">
      <div className="panel">
        <h2><Users size={20} /> Users</h2>
        <div className="user-list">
          {users.map((item) => (
            <article key={item.id} className="user-row">
              <div>
                <strong>{item.name}</strong>
                <span>{item.email}</span>
              </div>
              <span className="role-pill">{item.role}</span>
              <button className="icon-button" title="Edit user" onClick={() => setDraft({ ...item, password: "" })}><Edit3 size={17} /></button>
              <button className="icon-button danger" title="Delete user" onClick={() => deleteUser(item.id)}><Trash2 size={17} /></button>
            </article>
          ))}
        </div>
      </div>
      <div className="panel">
        <h2><UserPlus size={20} /> {draft.id ? "Edit user" : "Add user"}</h2>
        <form className="comic-form" onSubmit={saveUser}>
          <label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
          <label>Email<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} required /></label>
          <label>Password<input type="password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} placeholder={draft.id ? "Leave blank to keep current" : ""} minLength={draft.id ? undefined : 8} /></label>
          <label>Role<select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as Role })}><option>USER</option><option>ADMIN</option></select></label>
          <button className="primary" type="submit">{draft.id ? "Save user" : "Create user"}</button>
        </form>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

async function api<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.message ?? "Request failed.");
  return data;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
