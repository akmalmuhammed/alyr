// A drawn tile for a sample item (D-039, ALY-107). A sample has no photo: nothing is stored,
// downloaded or copyrighted. The picture is worked out from the sample's key by a few lines of
// arithmetic, so the same key always draws the same tile, on the server and in the browser, and
// two samples rarely look alike. It is made of three plain shapes in the workspace's own
// greys and its one accent (colours come from the tokens in catalog.css, not from here).

/** FNV-1a: a number from a word, the same every time. */
function seed(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A small linear congruential generator, so one seed gives a fixed run of numbers. */
function numbers(key: string): () => number {
  let state = seed(key);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

type Shape = { kind: "disc" | "square" | "wedge"; x: number; y: number; size: number; turn: number };

/** The three shapes a key draws: where they sit, how big, and how they are turned. */
export function shapesOf(key: string): Shape[] {
  const next = numbers(key);
  const kinds = ["disc", "square", "wedge"] as const;
  return [0, 1, 2].map(() => ({
    kind: kinds[Math.floor(next() * kinds.length)],
    x: 20 + next() * 60,
    y: 20 + next() * 60,
    size: 12 + next() * 18,
    turn: Math.floor(next() * 12) * 15,
  }));
}

const fix = (n: number) => n.toFixed(1);

export function SampleArt({ sampleKey }: { sampleKey: string }) {
  const shapes = shapesOf(sampleKey);
  return (
    <svg className="ct-sample-art" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {shapes.map((s, i) => {
        const place = `rotate(${s.turn} ${fix(s.x)} ${fix(s.y)})`;
        const className = ["a", "b", "c"][i];
        if (s.kind === "disc") return <circle key={i} className={className} cx={fix(s.x)} cy={fix(s.y)} r={fix(s.size)} />;
        if (s.kind === "square") {
          return <rect key={i} className={className} x={fix(s.x - s.size)} y={fix(s.y - s.size)} width={fix(s.size * 2)} height={fix(s.size * 2)} rx="6" transform={place} />;
        }
        const d = `M${fix(s.x - s.size)} ${fix(s.y + s.size)}L${fix(s.x)} ${fix(s.y - s.size)}L${fix(s.x + s.size)} ${fix(s.y + s.size)}Z`;
        return <path key={i} className={className} d={d} transform={place} />;
      })}
    </svg>
  );
}
