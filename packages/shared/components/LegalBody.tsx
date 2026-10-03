import { fillLegal, parseLegal } from '@longrak/shared/legal-docs';

/** A privacy policy or terms text (see @longrak/shared/legal-docs) as headings, paragraphs and lists. */
export default function LegalBody({ body, operator, contact }: { body: string; operator: string; contact: string }) {
  const fill = (s: string) => fillLegal(s, { operator, contact });
  return (
    <>
      {parseLegal(body).map((b, i) =>
        b.kind === 'h2' ? (
          <h2 key={i} id={b.id}>
            {fill(b.text)}
          </h2>
        ) : b.kind === 'ul' ? (
          <ul key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{fill(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{fill(b.text)}</p>
        ),
      )}
    </>
  );
}
