"use client";

import { useEffect, useState } from "react";
import Hero from "./Hero";
import HowItWorks from "./HowItWorks";
import Replay from "./Replay";
import Results from "./Results";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";
import type { Summary } from "../lib/monitus";
import { errorMessage, loadJson } from "../lib/monitus";

const Dashboard = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadJson<Summary>("/data/summary.json")
      .then((data) => setSummary(data))
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  return (
    <>
      <SiteHeader />
      <main id="top">
        {error && (
          <div className="wrap">
            <p className="page-error">{error}</p>
          </div>
        )}
        {summary ? (
          <>
            <Hero summary={summary} />
            <Replay summary={summary} />
            <Results summary={summary} />
            <HowItWorks />
          </>
        ) : (
          !error && <div className="page-loading" aria-hidden="true" />
        )}
      </main>
      <SiteFooter />
    </>
  );
};

export default Dashboard;
