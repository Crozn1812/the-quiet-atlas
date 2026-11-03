export function ForestBackdrop() {
  return (
    <div
      className="forest-backdrop"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <path
            id="pine"
            d="M0 0 -45 100 -24 100 -65 165 -32 165 -80 235 -9 235 -9 285 9 285 9 235 80 235 32 165 65 165 24 100 45 100Z"
          />
        </defs>
        <g
          fill="#637d70"
          opacity=".5"
        >
          <use
            href="#pine"
            transform="translate(150 170) scale(2)"
          />
          <use
            href="#pine"
            transform="translate(450 190) scale(1.5)"
          />
          <use
            href="#pine"
            transform="translate(750 150) scale(2)"
          />
        </g>
        <path
          fill="#405e50"
          d="M0 570Q300 440 600 590T1200 530V800H0Z"
        />
        <g
          fill="#254a40"
        >
          <use
            href="#pine"
            transform="translate(60 0) scale(3)"
          />
          <use
            href="#pine"
            transform="translate(1120 -80) scale(3.5)"
          />
          <use
            href="#pine"
            transform="translate(900 180) scale(2)"
          />
        </g>
      </svg>
    </div>
  );
}
