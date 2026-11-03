export function ProjectHeading({ title, statusLabel }: {
  title: string;
  statusLabel: string;
}) {
  return (
    <>
      <h1>{title}</h1>
      <p>{statusLabel}</p>
    </>
  );
}
