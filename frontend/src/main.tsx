import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Edit3, LogOut, Search, Shield, Trash2, UserPlus, Users, Vault } from "lucide-react";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8084";

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
  title: string;
  writer?: string | null;
  artist?: string | null;
  penciler?: string | null;
  inker?: string | null;
  pricePaid: string | number;
  currentPrice: string | number;
  coverUrl?: string | null;
  source?: string | null;
  sourceId?: string | null;
};

type ComicDraft = Omit<Comic, "id">;
type SearchResult = ComicDraft & { source: string; sourceId: string };

const emptyComic: ComicDraft = {
  title: "",
  writer: "",
  artist: "",
  penciler: "",
  inker: "",
  pricePaid: 0,
  currentPrice: 0,
  coverUrl: "",
  source: "",
  sourceId: ""
};

function currency(value: string | number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value ?? 0));
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

  const totals = useMemo(() => {
    const currentValue = comics.reduce((sum, comic) => sum + Number(comic.currentPrice ?? 0), 0);
    const paidValue = comics.reduce((sum, comic) => sum + Number(comic.pricePaid ?? 0), 0);
    return { currentValue, paidValue, gain: currentValue - paidValue };
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

  async function estimatePrice(title = draft.title) {
    if (!title) return;
    const data = await api<{ price: number | null }>(`/search/price?title=${encodeURIComponent(title)}`, token);
    if (data.price) setDraft((current) => ({ ...current, currentPrice: data.price ?? 0 }));
  }

  async function saveComic(event: FormEvent) {
    event.preventDefault();
    const path = editingId ? `/comics/${editingId}` : "/comics";
    await api(path, token, { method: editingId ? "PUT" : "POST", body: JSON.stringify(draft) });
    setDraft(emptyComic);
    setEditingId(null);
    setResults([]);
    await loadComics();
  }

  async function deleteComic(id: string) {
    await api(`/comics/${id}`, token, { method: "DELETE" });
    await loadComics();
  }

  function editComic(comic: Comic) {
    setEditingId(comic.id);
    setDraft({
      title: comic.title,
      writer: comic.writer ?? "",
      artist: comic.artist ?? "",
      penciler: comic.penciler ?? "",
      inker: comic.inker ?? "",
      pricePaid: Number(comic.pricePaid),
      currentPrice: Number(comic.currentPrice),
      coverUrl: comic.coverUrl ?? "",
      source: comic.source ?? "",
      sourceId: comic.sourceId ?? ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function useResult(result: SearchResult) {
    setDraft({ ...emptyComic, ...result, pricePaid: 0, currentPrice: 0 });
    estimatePrice(result.title);
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
          <section className="dashboard">
            <Stat label="Books" value={String(comics.length)} />
            <Stat label="Current value" value={currency(totals.currentValue)} />
            <Stat label="Paid" value={currency(totals.paidValue)} />
            <Stat label="Difference" value={currency(totals.gain)} />
          </section>

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
                      {result.coverUrl && <img src={result.coverUrl} alt="" />}
                      <span>{result.title}</span>
                    </button>
                  ))}
                </div>
              )}
              <ComicForm draft={draft} setDraft={setDraft} onSubmit={saveComic} onEstimate={() => estimatePrice()} editing={Boolean(editingId)} />
            </div>

            <div className="panel inventory-panel">
              <div className="inventory-header">
                <h2>Your inventory</h2>
                <div className="search-row inventory-search">
                  <Search size={18} />
                  <input placeholder="Search your vault" value={query} onChange={(event) => setQuery(event.target.value)} />
                </div>
              </div>
              <div className="comic-grid">
                {comics.map((comic) => (
                  <article className="comic-card" key={comic.id}>
                    <div className="cover-frame">{comic.coverUrl ? <img src={comic.coverUrl} alt="" /> : <Vault size={48} />}</div>
                    <div className="comic-body">
                      <h3>{comic.title}</h3>
                      <p>{[comic.writer, comic.artist].filter(Boolean).join(" / ") || "Creator details pending"}</p>
                      <div className="price-row">
                        <span>{currency(comic.currentPrice)}</span>
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

function ComicForm({ draft, setDraft, onSubmit, onEstimate, editing }: { draft: ComicDraft; setDraft: (draft: ComicDraft) => void; onSubmit: (event: FormEvent) => void; onEstimate: () => void; editing: boolean }) {
  const set = (key: keyof ComicDraft, value: string | number) => setDraft({ ...draft, [key]: value });
  return (
    <form className="comic-form" onSubmit={onSubmit}>
      <label>Book name<input value={draft.title} onChange={(event) => set("title", event.target.value)} required /></label>
      <div className="field-pair">
        <label>Writer<input value={draft.writer ?? ""} onChange={(event) => set("writer", event.target.value)} /></label>
        <label>Artist<input value={draft.artist ?? ""} onChange={(event) => set("artist", event.target.value)} /></label>
      </div>
      <div className="field-pair">
        <label>Penciler<input value={draft.penciler ?? ""} onChange={(event) => set("penciler", event.target.value)} /></label>
        <label>Inker<input value={draft.inker ?? ""} onChange={(event) => set("inker", event.target.value)} /></label>
      </div>
      <div className="field-pair">
        <label>Price paid<input type="number" min="0" step="0.01" value={draft.pricePaid} onChange={(event) => set("pricePaid", event.target.value)} /></label>
        <label>Current price<input type="number" min="0" step="0.01" value={draft.currentPrice} onChange={(event) => set("currentPrice", event.target.value)} /></label>
      </div>
      <label>Cover image URL<input value={draft.coverUrl ?? ""} onChange={(event) => set("coverUrl", event.target.value)} /></label>
      <div className="form-actions">
        <button className="secondary" type="button" onClick={onEstimate}>Estimate value</button>
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
