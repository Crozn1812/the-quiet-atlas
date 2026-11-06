export function ForestBackdrop() {
  return (
    <div
      className="forest-backdrop"
      aria-hidden="true"
    >
      <picture>
        <source
          media="(max-width: 900px)"
          srcSet="/welcome/hero-coast-960.webp"
          width={960}
          height={540}
        />
        {/* Native picture keeps the responsive, decorative backdrop available without JS. */}
        <img
          src="/welcome/hero-coast-1920.webp"
          width={1920}
          height={1080}
          fetchPriority="high"
          alt=""
        />
      </picture>
    </div>
  );
}
