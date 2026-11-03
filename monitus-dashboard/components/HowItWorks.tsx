const STEPS = [
  {
    title: "Read the sensors",
    body: "Each sensor reports once a second. Each minute is boiled down to its median, so a single spike can't fool the system.",
  },
  {
    title: "Describe each minute",
    body: "For every sensor: its level, how much it's wobbling, and how far it has moved over the last 10 and 60 minutes. That's five numbers per sensor, so 25 a minute in this version.",
  },
  {
    title: "Score the risk",
    body: "A gradient-boosted model, trained on real, simulated and hand-drawn recordings, gives the chance that something is wrong and which fault it looks like.",
  },
  {
    title: "Raise the alarm",
    body: "Only when the risk stays above 98% for 10 minutes in a row. One odd minute is noise; ten in a row is a pattern.",
  },
];

const WellDiagram = () => (
  <svg
    className="well"
    viewBox="0 0 460 540"
    role="img"
    aria-labelledby="well-title well-desc"
  >
    <title id="well-title">Where the five sensors sit on an offshore well</title>
    <desc id="well-desc">
      A floating platform with the production choke, a riser down to the Christmas tree on the seabed, and the well
      running down to the reservoir. Pressure and temperature sensors sit at the bottom of the well, at the tree, and
      either side of the platform choke.
    </desc>

    <rect x="0" y="118" width="460" height="232" className="well-sea" />
    <rect x="0" y="350" width="460" height="190" className="well-rock" />
    <rect x="0" y="470" width="460" height="46" className="well-reservoir" />
    <path d="M0 118 Q 28 110 57 118 T 115 118 T 172 118 T 230 118 T 287 118 T 345 118 T 402 118 T 460 118" className="well-surface" />
    <line x1="0" y1="350" x2="460" y2="350" className="well-seabed" />

    <rect x="40" y="84" width="200" height="14" rx="2" className="well-deck" />
    <rect x="62" y="98" width="20" height="44" className="well-column" />
    <rect x="198" y="98" width="20" height="44" className="well-column" />
    <rect x="52" y="140" width="176" height="12" rx="6" className="well-column" />

    <path d="M208 84 V 74 H 70" className="well-pipe" />
    <path d="M208 98 V 160 C 208 250, 300 260, 300 320 V 330" className="well-pipe" />
    <path d="M130 66 L 146 74 L 130 82 Z M 162 66 L 146 74 L 162 82 Z" className="well-choke" />
    <rect x="286" y="322" width="28" height="28" rx="3" className="well-tree" />
    <path d="M300 350 V 490" className="well-bore" />

    <text x="250" y="96" className="well-note">Platform</text>
    <text x="252" y="340" className="well-note" textAnchor="end">Christmas tree</text>
    <text x="14" y="507" className="well-note">Reservoir</text>

    <g className="well-sensor">
      <circle cx="178" cy="74" r="7" />
      <line x1="178" y1="66" x2="178" y2="44" />
      <text x="184" y="40">P-MON-CKP</text>
    </g>
    <g className="well-sensor">
      <circle cx="104" cy="74" r="7" />
      <line x1="104" y1="66" x2="104" y2="44" />
      <text x="98" y="40" textAnchor="end">T-JUS-CKP</text>
    </g>
    <g className="well-sensor">
      <circle cx="314" cy="330" r="7" />
      <line x1="321" y1="328" x2="338" y2="312" />
      <text x="342" y="306">P-TPT</text>
      <text x="342" y="322" className="well-sensor-sub">T-TPT</text>
    </g>
    <g className="well-sensor">
      <circle cx="300" cy="476" r="7" />
      <line x1="307" y1="476" x2="338" y2="476" />
      <text x="342" y="481">P-PDG</text>
    </g>
  </svg>
);

const SENSOR_KEY = [
  { name: "P-PDG", text: "Pressure at the bottom of the well" },
  { name: "P-TPT and T-TPT", text: "Pressure and temperature at the Christmas tree on the seabed" },
  { name: "P-MON-CKP", text: "Pressure just before the platform choke" },
  { name: "T-JUS-CKP", text: "Temperature just after the platform choke" },
];

const HowItWorks = () => (
  <section id="how" className="section" aria-labelledby="how-title">
    <div className="wrap">
      <div className="section-head">
        <h2 id="how-title">How it works</h2>
        <p>
          This version uses the five sensors recorded in most of Petrobras&apos; data. The pipeline isn&apos;t tied to
          five: add a sensor to the list and retrain. The names are Portuguese abbreviations from Petrobras.
        </p>
      </div>

      <div className="how">
        <figure className="how-figure">
          <WellDiagram />
          <dl className="sensor-key">
            {SENSOR_KEY.map((item) => (
              <div key={item.name}>
                <dt>{item.name}</dt>
                <dd>{item.text}</dd>
              </div>
            ))}
          </dl>
        </figure>

        <div className="how-text">
          <ol className="steps">
            {STEPS.map((step) => (
              <li key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>

          <div className="tested">
            <h3>Tested the strict way</h3>
            <p>
              The real recordings come from just 40 wells, and the same well shows up again and again. If a well sits in
              both training and testing, a model can learn to recognise the well instead of the fault, and its scores
              look far better than they would offshore.
            </p>
            <p>
              So the wells were split into five groups. Each group took a turn as the test set while the model trained on
              the rest. Every result on this page comes from a well the model had never seen.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default HowItWorks;
