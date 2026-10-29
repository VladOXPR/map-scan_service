"use client";

import { useState, type FormEvent } from "react";
import { GradientButton } from "@/components/GradientButton";
import styles from "./crawl.module.css";

type Match = { stationId: string; title: string };
type Step = "id" | "pick" | "confirm" | "done";

async function postJson(path: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: "Couldn't reach the server. Check your connection and try again." } };
  }
}

function errorText(data: Record<string, unknown>): string {
  return typeof data.error === "string" ? data.error : "Something went wrong. Please try again.";
}

export function CrawlFlow() {
  const [step, setStep] = useState<Step>("id");
  const [digits, setDigits] = useState("");
  const [password, setPassword] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState<Match | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const backToId = (message: string | null = null) => {
    setStep("id");
    setMatches([]);
    setSelected(null);
    setError(message);
  };

  const lookup = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{3}$/.test(digits)) {
      setError("Enter the last 3 digits of the station ID.");
      return;
    }
    setBusy(true);
    setError(null);
    const { ok, data } = await postJson("/api/crawl/lookup", { digits, password });
    setBusy(false);
    if (!ok) {
      setError(errorText(data));
      return;
    }
    const found = Array.isArray(data.matches) ? (data.matches as Match[]) : [];
    if (found.length === 0) {
      setError(`No station ends in ${digits}. Check the digits and try again.`);
      return;
    }
    setMatches(found);
    if (found.length === 1) {
      setSelected(found[0]);
      setStep("confirm");
    } else {
      setStep("pick");
    }
  };

  const pick = (match: Match) => {
    setSelected(match);
    setStep("confirm");
  };

  const dispense = async () => {
    if (busy || !selected) return;
    setBusy(true);
    setError(null);
    const { ok, data } = await postJson("/api/crawl/dispense", {
      digits,
      password,
      stationId: selected.stationId,
    });
    setBusy(false);
    if (!ok) {
      backToId(errorText(data));
      return;
    }
    setStep("done");
  };

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        {step === "id" && (
          <form className={styles.form} onSubmit={lookup} noValidate>
            <header className={styles.header}>
              <h1 className={styles.title}>Grab a Free Power-Bank</h1>
              <p className={styles.subtitle}>For the Northside Crawl Team</p>
            </header>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.station} src="/crawl/station.png" alt="CUUB power bank station" width={807} height={1024} />

            <label className={styles.field}>
              <span className={styles.label}>
                Input the last 3 digits of the station ID found in the bottom right side of the screen.
              </span>
              <input
                className={`${styles.input} ${styles.digits}`}
                inputMode="numeric"
                autoComplete="off"
                pattern="\d{3}"
                maxLength={3}
                placeholder="000"
                value={digits}
                onChange={(event) => setDigits(event.target.value.replace(/\D/g, "").slice(0, 3))}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Input password given to you.</span>
              <input
                className={styles.input}
                type="password"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {error && <p className={styles.error} role="alert">{error}</p>}

            <button type="submit" className="cuub-gradient-btn" disabled={busy || digits.length !== 3 || !password}>
              <span className="cuub-gradient-btn-label">{busy ? "Checking..." : "Continue"}</span>
            </button>
          </form>
        )}

        {step === "pick" && (
          <section className={styles.section}>
            <h2 className={styles.question}>Which location are you at?</h2>
            <div className={styles.choices}>
              {matches.map((match) => (
                <GradientButton key={match.stationId} label={match.title} onClick={() => pick(match)} />
              ))}
              <button type="button" className={styles.secondary} onClick={() => backToId()}>
                Neither
              </button>
            </div>
          </section>
        )}

        {step === "confirm" && selected && (
          <section className={styles.section}>
            <h2 className={styles.question}>Is this the location you&apos;re at?</h2>
            <p className={styles.location}>{selected.title}</p>
            <div className={styles.choices}>
              <GradientButton label={busy ? "Releasing..." : "Yes"} onClick={dispense} disabled={busy} />
              <button type="button" className={styles.secondary} onClick={() => backToId()} disabled={busy}>
                No
              </button>
            </div>
          </section>
        )}

        {step === "done" && selected && (
          <section className={styles.section}>
            <h2 className={styles.question}>Your power bank is popping out now.</h2>
            <p className={styles.note}>Grab it from the station at {selected.title}. Enjoy the crawl!</p>
          </section>
        )}
      </div>
    </main>
  );
}
