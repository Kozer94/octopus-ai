import { useEffect, useState } from "react";
import { TYPING_SNIPPETS } from '../config/uiConfig';

export function TypingCode() {
  const [text, setText] = useState('');
  const [idx, setIdx] = useState(0);
  const [snippetIdx, setSnippetIdx] = useState(0);

  useEffect(() => {
    const current = TYPING_SNIPPETS[snippetIdx % TYPING_SNIPPETS.length];
    if (idx < current.length) {
      const timer = setTimeout(() => {
        setText(current.slice(0, idx + 1));
        setIdx(idx + 1);
      }, 50);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setText('');
      setIdx(0);
      setSnippetIdx(s => s + 1);
    }, 800);
    return () => clearTimeout(timer);
  }, [idx, snippetIdx]);

  return <span>{text}<span data-respects-reduced-motion style={{ animation: 'octopusTyping 0.5s infinite', opacity: 0.8 }}>|</span></span>;
}
