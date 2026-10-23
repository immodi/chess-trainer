import { GLOSSARY } from '../../data/glossary';

export interface GlossaryProps {
  onBack: () => void;
}

export function GlossaryList() {
  return (
    <dl className="glossary">
      {GLOSSARY.map((term) => (
        <div key={term.id} className="glossary__entry">
          <dt className="glossary__term">{term.name}</dt>
          <dd className="glossary__definition">{term.definition}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Glossary({ onBack }: GlossaryProps) {
  return (
    <main className="app">
      <header className="screen__header">
        <button type="button" className="button button--ghost" onClick={onBack}>
          Back
        </button>
        <h1>Glossary</h1>
      </header>

      <p className="screen__lead">
        Plain-language definitions for the words the coach uses. No jargon without an explanation.
      </p>

      <GlossaryList />
    </main>
  );
}
