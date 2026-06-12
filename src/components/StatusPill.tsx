interface StatusPillProps {
  tone: "neutral" | "success" | "warning";
  text: string;
}

export function StatusPill({ tone, text }: StatusPillProps) {
  return <span className={`status-pill status-pill--${tone}`}>{text}</span>;
}
