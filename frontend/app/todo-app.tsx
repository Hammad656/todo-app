"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type User = { id: string; email: string };
type Todo = {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};
type Filter = "all" | "today" | "upcoming" | "completed";
type ApiError = Error & { status?: number };
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function fetchBackend(url: string, init?: RequestInit) {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error(
      `Can't reach the FastAPI backend at ${API_BASE_URL}. Start it with "cd backend" and "uvicorn app.main:app --reload --port 4000".`,
    );
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetchBackend(`${API_BASE_URL}${url}`, {
    ...init,
    credentials: "include",
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : "Something went wrong. Please try again.";
    const error = new Error(message) as ApiError;
    error.status = response.status;
    throw error;
  }
  return data as T;
}

function localDate() {
  const date = new Date();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  if (name === "plus") {
    return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  }
  if (name === "calendar") {
    return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>;
  }
  if (name === "check") {
    return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
  }
  if (name === "edit") {
    return <svg {...common}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg>;
  }
  if (name === "trash") {
    return <svg {...common}><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" /></svg>;
  }
  if (name === "logout") {
    return <svg {...common}><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></svg>;
  }
  if (name === "spark") {
    return <svg {...common}><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14Z" /></svg>;
  }
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
}

export default function TodoApp() {
  const [user, setUser] = useState<User | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loadingTodos, setLoadingTodos] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [filter, setFilter] = useState<Filter>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let mounted = true;
    async function checkSession() {
      try {
        const response = await fetchBackend(`${API_BASE_URL}/api/auth/me`, {
          cache: "no-store",
          credentials: "include",
        });
        if (response.ok) {
          const data = (await response.json()) as { user: User };
          if (mounted) setUser(data.user);
        } else if (response.status !== 401) {
          throw new Error("We could not verify your session. Please refresh the page.");
        }
      } catch (sessionError) {
        if (mounted) setError(sessionError instanceof Error ? sessionError.message : "Unable to connect.");
      } finally {
        if (mounted) setCheckingSession(false);
      }
    }
    void checkSession();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    api<{ todos: Todo[] }>("/api/todos")
      .then(({ todos: loadedTodos }) => {
        if (mounted) setTodos(loadedTodos);
      })
      .catch((loadError: unknown) => {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Unable to load your tasks.");
      })
      .finally(() => {
        if (mounted) setLoadingTodos(false);
      });
    return () => {
      mounted = false;
    };
  }, [user]);

  const today = localDate();
  const counts = useMemo(
    () => ({
      all: todos.length,
      today: todos.filter((todo) => todo.dueDate === today && !todo.completed).length,
      upcoming: todos.filter((todo) => todo.dueDate > today && !todo.completed).length,
      completed: todos.filter((todo) => todo.completed).length,
    }),
    [todos, today],
  );

  const visibleTodos = useMemo(() => {
    return todos.filter((todo) => {
      if (filter === "today") return todo.dueDate === today && !todo.completed;
      if (filter === "upcoming") return todo.dueDate > today && !todo.completed;
      if (filter === "completed") return todo.completed;
      return true;
    });
  }, [filter, todos, today]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const formData = new FormData(event.currentTarget);
    try {
      const data = await api<{ user: User }>(`/api/auth/${authMode}`, {
        method: "POST",
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
        }),
      });
      setLoadingTodos(true);
      setUser(data.user);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to authenticate.");
    }
  }

  async function handleLogout() {
    setError("");
    try {
      await api("/api/auth/logout", { method: "POST" });
      setUser(null);
      setTodos([]);
      setNotice("");
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Could not sign out.");
    }
  }

  async function saveTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const payload = {
      title: formData.get("title"),
      description: formData.get("description"),
      dueDate: formData.get("dueDate"),
      completed: editingTodo?.completed ?? false,
    };

    try {
      const result = await api<{ todo: Todo }>(
        editingTodo ? `/api/todos/${editingTodo.id}` : "/api/todos",
        {
          method: editingTodo ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setTodos((current) =>
        editingTodo
          ? current.map((todo) => (todo.id === result.todo.id ? result.todo : todo))
          : [result.todo, ...current],
      );
      setEditorOpen(false);
      setEditingTodo(null);
      setNotice(editingTodo ? "Your changes are saved." : "A new task is on your list.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this task.");
    }
  }

  async function toggleTodo(todo: Todo) {
    setError("");
    try {
      const result = await api<{ todo: Todo }>(`/api/todos/${todo.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...todo, completed: !todo.completed }),
      });
      setTodos((current) => current.map((item) => (item.id === todo.id ? result.todo : item)));
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not update this task.");
    }
  }

  async function deleteTodo(todo: Todo) {
    if (!window.confirm(`Delete "${todo.title}"? This cannot be undone.`)) return;
    setError("");
    try {
      await api(`/api/todos/${todo.id}`, { method: "DELETE" });
      setTodos((current) => current.filter((item) => item.id !== todo.id));
      setNotice("Task deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete this task.");
    }
  }

  if (checkingSession) {
    return <main className="loading-screen"><span className="loading-mark"><Icon name="check" size={21} /></span><span>Getting your day in order...</span></main>;
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-visual">
          <Link className="brand brand-light" href="/" aria-label="Daymark home">
            <span className="brand-mark"><Icon name="check" size={20} /></span>
            <span>daymark</span>
          </Link>
          <div className="visual-copy">
            <span className="eyebrow">A little more room to think</span>
            <h1>Make space for<br /><em>what matters.</em></h1>
            <p>A calmer way to keep track of your plans, one day at a time.</p>
          </div>
          <div className="visual-note">
            <span className="note-check"><Icon name="check" size={15} /></span>
            <span><strong>Small steps add up.</strong><br />You’re right where you need to be.</span>
          </div>
          <span className="visual-orb orb-one" />
          <span className="visual-orb orb-two" />
        </section>

        <section className="auth-panel">
          <div className="auth-card">
            <div className="auth-mobile-brand brand">
              <span className="brand-mark"><Icon name="check" size={20} /></span><span>daymark</span>
            </div>
            <span className="eyebrow">{authMode === "signup" ? "YOUR NEXT CHAPTER" : "WELCOME BACK"}</span>
            <h2>{authMode === "signup" ? "Start with a fresh page." : "Good to see you again."}</h2>
            <p className="auth-intro">
              {authMode === "signup"
                ? "Create an account and bring a little more clarity to your day."
                : "Sign in to pick up right where you left off."}
            </p>

            {error && <div className="form-alert" role="alert">{error}</div>}
            <form className="auth-form" onSubmit={handleAuth}>
              <label htmlFor="email">Email address</label>
              <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} />
              <div className="label-row">
                <label htmlFor="password">Password</label>
                {authMode === "signup" && <span>At least 8 characters</span>}
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                placeholder="Enter your password"
                required
                minLength={authMode === "signup" ? 8 : undefined}
                maxLength={72}
              />
              <button className="button button-primary auth-submit" type="submit">
                {authMode === "signup" ? "Create your account" : "Sign in"} <span aria-hidden="true">→</span>
              </button>
            </form>
            <p className="auth-switch">
              {authMode === "signup" ? "Already have an account?" : "New to Daymark?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === "signup" ? "login" : "signup");
                  setError("");
                }}
              >
                {authMode === "signup" ? "Sign in" : "Create an account"}
              </button>
            </p>
            <p className="privacy-note"><span className="privacy-dot" /> Your tasks are private and only visible to you.</p>
          </div>
        </section>
      </main>
    );
  }

  const firstName = user.email.split("@")[0].split(/[._-]/)[0];
  const formattedToday = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Daymark home">
          <span className="brand-mark"><Icon name="check" size={20} /></span><span>daymark</span>
        </Link>
        <div className="sidebar-section">
          <span className="sidebar-heading">WORKSPACE</span>
          <nav className="side-nav" aria-label="Task filters">
            {([
              ["all", "All tasks", "list"],
              ["today", "Today", "calendar"],
              ["upcoming", "Upcoming", "clock"],
              ["completed", "Completed", "check"],
            ] as [Filter, string, string][]).map(([key, label, icon]) => (
              <button
                type="button"
                key={key}
                className={`nav-item ${filter === key ? "active" : ""}`}
                onClick={() => setFilter(key)}
              >
                <Icon name={icon} size={17} /><span>{label}</span><span className="nav-count">{counts[key]}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-tip">
          <span className="tip-icon"><Icon name="spark" size={17} /></span>
          <strong>One thing at a time.</strong>
          <p>You don’t have to do it all today. Just the next thing.</p>
        </div>

        <div className="sidebar-profile">
          <div className="avatar">{user.email.charAt(0).toUpperCase()}</div>
          <div className="profile-copy"><strong>{firstName}</strong><span>{user.email}</span></div>
          <button className="icon-button logout-button" type="button" onClick={handleLogout} aria-label="Sign out" title="Sign out">
            <Icon name="logout" size={17} />
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand brand"><span className="brand-mark"><Icon name="check" size={20} /></span><span>daymark</span></div>
          <div className="breadcrumbs">Your space <span>/</span> <strong>{filter === "all" ? "All tasks" : filter[0].toUpperCase() + filter.slice(1)}</strong></div>
          <button className="button button-primary top-add" type="button" onClick={() => { setEditingTodo(null); setEditorOpen(true); }}>
            <Icon name="plus" size={17} /> <span>New task</span>
          </button>
          <button className="mobile-logout icon-button" type="button" onClick={handleLogout} aria-label="Sign out"><Icon name="logout" size={17} /></button>
        </header>

        <div className="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">{formattedToday}</span>
              <h1>{filter === "all" ? <>A good day to <em>begin.</em></> : filter === "today" ? <>Your day, <em>in focus.</em></> : filter === "upcoming" ? <>Good things <em>ahead.</em></> : <>Look how far <em>you’ve come.</em></>}</h1>
              <p>{filter === "completed" ? "Every finished task is a small win worth noticing." : "A clear mind starts with a clear list."}</p>
            </div>
            <div className="progress-card">
              <div className="progress-ring" style={{ "--progress": `${todos.length ? Math.round((counts.completed / todos.length) * 100) : 0}%` } as React.CSSProperties}>
                <span>{todos.length ? Math.round((counts.completed / todos.length) * 100) : 0}<small>%</small></span>
              </div>
              <div><strong>Your progress</strong><span>{counts.completed} of {todos.length} complete</span></div>
            </div>
          </div>

          <div className="stats-row">
            <div className="stat-card stat-total">
              <span className="stat-icon"><Icon name="list" size={18} /></span>
              <span className="stat-label">Total tasks</span><strong>{counts.all}</strong>
              <span className="stat-caption">Across your list</span>
            </div>
            <div className="stat-card stat-today">
              <span className="stat-icon"><Icon name="calendar" size={18} /></span>
              <span className="stat-label">For today</span><strong>{counts.today}</strong>
              <span className="stat-caption">Ready when you are</span>
            </div>
            <div className="stat-card stat-done">
              <span className="stat-icon"><Icon name="check" size={18} /></span>
              <span className="stat-label">Completed</span><strong>{counts.completed}</strong>
              <span className="stat-caption">Nice work, keep going</span>
            </div>
          </div>

          {error && <div className="workspace-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
          {notice && <div className="workspace-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Dismiss notification">×</button></div>}

          <div className="list-heading">
            <div><h2>{filter === "all" ? "Your tasks" : filter === "today" ? "Today’s focus" : filter === "upcoming" ? "Coming up" : "Completed tasks"}</h2><span>{visibleTodos.length} {visibleTodos.length === 1 ? "task" : "tasks"}</span></div>
            <button className="text-button" type="button" onClick={() => { setEditingTodo(null); setEditorOpen(true); }}><Icon name="plus" size={16} /> Add a task</button>
          </div>

          {loadingTodos ? (
            <div className="empty-state"><span className="loading-mark"><Icon name="check" size={18} /></span><p>Loading your tasks...</p></div>
          ) : visibleTodos.length ? (
            <div className="task-list">
              {visibleTodos.map((todo) => {
                const overdue = !todo.completed && todo.dueDate < today;
                return (
                  <article className={`task-card ${todo.completed ? "task-completed" : ""}`} key={todo.id}>
                    <button
                      className={`task-check ${todo.completed ? "checked" : ""}`}
                      type="button"
                      onClick={() => void toggleTodo(todo)}
                      aria-label={todo.completed ? `Mark ${todo.title} incomplete` : `Complete ${todo.title}`}
                    >
                      {todo.completed && <Icon name="check" size={15} />}
                    </button>
                    <div className="task-copy">
                      <h3>{todo.title}</h3>
                      {todo.description && <p>{todo.description}</p>}
                    </div>
                    <span className={`task-date ${overdue ? "date-overdue" : ""} ${todo.completed ? "date-complete" : ""}`}>
                      <Icon name="calendar" size={14} />{overdue ? "Overdue · " : ""}{formatDate(todo.dueDate)}
                    </span>
                    <div className="task-actions">
                      <button className="icon-button" type="button" onClick={() => { setEditingTodo(todo); setEditorOpen(true); }} aria-label={`Edit ${todo.title}`} title="Edit task"><Icon name="edit" size={16} /></button>
                      <button className="icon-button delete-action" type="button" onClick={() => void deleteTodo(todo)} aria-label={`Delete ${todo.title}`} title="Delete task"><Icon name="trash" size={16} /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-icon"><Icon name={filter === "completed" ? "spark" : "check"} size={22} /></span>
              <h3>{filter === "completed" ? "Your wins will show up here." : filter === "today" ? "Nothing due today." : filter === "upcoming" ? "Your calendar is clear." : "A fresh start."}</h3>
              <p>{filter === "all" ? "Add your first task and make a little room to focus." : "Enjoy the breathing room, or add something new to your list."}</p>
              <button className="button button-secondary" type="button" onClick={() => { setEditingTodo(null); setEditorOpen(true); }}>
                <Icon name="plus" size={16} /> Create a task
              </button>
            </div>
          )}
          <footer className="page-footer"><span>Made for the things that matter.</span><span>Take it one step at a time <span className="footer-heart">♥</span></span></footer>
        </div>
      </section>

      {editorOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEditorOpen(false); setEditingTodo(null); } }}>
          <section className="task-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <button className="modal-close icon-button" type="button" onClick={() => { setEditorOpen(false); setEditingTodo(null); }} aria-label="Close dialog">×</button>
            <span className="eyebrow">{editingTodo ? "MAKE IT JUST RIGHT" : "A NEW BEGINNING"}</span>
            <h2 id="modal-title">{editingTodo ? "Edit your task" : "What’s on your mind?"}</h2>
            <p className="modal-intro">Give it a name, add the details, and choose your day.</p>
            {error && <div className="form-alert" role="alert">{error}</div>}
            <form className="task-form" onSubmit={saveTodo}>
              <label htmlFor="task-title">Task title</label>
              <input id="task-title" name="title" defaultValue={editingTodo?.title ?? ""} placeholder="e.g. Plan the week ahead" maxLength={160} required autoFocus />
              <label htmlFor="task-description">A few details <span>Optional</span></label>
              <textarea id="task-description" name="description" defaultValue={editingTodo?.description ?? ""} placeholder="Add a note to your future self..." maxLength={2000} rows={4} />
              <label htmlFor="task-date">Due date</label>
              <input id="task-date" name="dueDate" type="date" defaultValue={editingTodo?.dueDate ?? today} required />
              <div className="modal-actions">
                <button className="button button-quiet" type="button" onClick={() => { setEditorOpen(false); setEditingTodo(null); }}>Cancel</button>
                <button className="button button-primary" type="submit">{editingTodo ? "Save changes" : "Add to my list"} <span aria-hidden="true">→</span></button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
