import Image from "next/image";
import { DATASET_URL } from "../lib/monitus";

const SiteFooter = () => (
  <footer className="site-footer">
    <div className="wrap footer-row">
      <div className="footer-brand">
        <Image src="/brand/monitus-mark.png" alt="" width={401} height={322} className="footer-mark" />
        <p className="footer-tagline">Monitor. Detect. Prevent.</p>
      </div>
      <div className="footer-notes">
        <p>
          Built on Petrobras&apos; public <a href={DATASET_URL}>3W dataset</a>, licensed under CC BY 4.0.
        </p>
        <p>
          An independent project, not affiliated with or endorsed by Petrobras or any operator. Monitus gives early
          warning only and never controls equipment.
        </p>
      </div>
    </div>
  </footer>
);

export default SiteFooter;
