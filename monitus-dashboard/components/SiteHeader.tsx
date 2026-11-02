import Image from "next/image";

const SiteHeader = () => (
  <header className="site-header">
    <div className="wrap header-row">
      <a href="#top" className="brand" aria-label="Monitus home">
        <Image src="/brand/monitus-mark.png" alt="" width={401} height={322} className="brand-mark" priority />
        <Image src="/brand/monitus-word.png" alt="Monitus" width={696} height={172} className="brand-word" priority />
      </a>
      <nav aria-label="Sections">
        <a href="#replay">Replay</a>
        <a href="#results">Results</a>
        <a href="#how">How it works</a>
      </nav>
    </div>
  </header>
);

export default SiteHeader;
