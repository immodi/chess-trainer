export interface ChecklistProps {
  onBack: () => void;
}

const QUESTIONS = [
  {
    title: 'Is anything of mine hanging?',
    body: 'Look at every piece you own. Is it attacked, and is it defended enough? If not, move it or defend it.',
  },
  {
    title: 'Is anything of theirs hanging?',
    body: 'Look at every enemy piece. Can you take it for free? A free piece is usually the best move on the board.',
  },
  {
    title: 'What are all their checks, captures and threats?',
    body: 'Pretend it is their turn. What could they do to you right now? That is what you have to stop.',
  },
  {
    title: 'What did their last move threaten?',
    body: 'Every move changes something. Find the piece that just moved and ask what it now attacks.',
  },
];

export function Checklist({ onBack }: ChecklistProps) {
  return (
    <main className="app">
      <header className="screen__header">
        <button type="button" className="button button--ghost" onClick={onBack}>
          Back
        </button>
        <h1>Before every move</h1>
      </header>

      <p className="screen__lead">
        Run these four questions in order. It takes about ten seconds and catches most beginner
        losses.
      </p>

      <ol className="checklist">
        {QUESTIONS.map((question, index) => (
          <li key={question.title} className="checklist__item">
            <span className="checklist__number">{index + 1}</span>
            <div>
              <h2 className="checklist__title">{question.title}</h2>
              <p className="checklist__body">{question.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="screen__note">
        In a game, the app asks you question 3 before every move you make.
      </p>
    </main>
  );
}
