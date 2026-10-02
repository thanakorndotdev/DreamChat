/** Renders *actions* as stage directions, the rest as spoken lines. */
export default function RoleplayText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) =>
        part.length > 2 && part.startsWith('*') && part.endsWith('*') ? (
          <span key={i} className="stage">
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
