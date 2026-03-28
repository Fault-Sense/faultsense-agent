import { useState, useEffect } from 'react'

interface LogEntry {
  id: number;
  message: string;
  time: string;
}

let nextId = 1;

export function ActivityLog() {
  const [entries, setEntries] = useState<LogEntry[]>([])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setEntries((prev) => [
        { id: nextId++, message: `Added: "${detail?.text || 'todo'}"`, time: new Date().toLocaleTimeString() },
        ...prev,
      ].slice(0, 5))
    }
    document.addEventListener('todo:added', handler)
    return () => document.removeEventListener('todo:added', handler)
  }, [])

  if (entries.length === 0) return null

  return (
    <div style={styles.container}>
      <div style={styles.header}>Activity Log</div>
      {/* fs-assert: When a todo:added event fires, verify a log entry appeared.
          Uses fs-trigger="event:todo:added" — a custom event trigger. */}
      <div
        id="activity-log"
        style={styles.entries}
        fs-trigger="event:todo:added"
        fs-assert="activity/log-updated"
        fs-assert-visible=".log-entry"
      >
        {entries.map((entry) => (
          <div key={entry.id} className="log-entry" style={styles.entry}>
            <span style={styles.time}>{entry.time}</span>
            <span style={styles.message}>{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    border: '1px solid #e4e4e7',
    borderRadius: 6,
    padding: '0.75rem',
    backgroundColor: '#fafafa',
  },
  header: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#71717a',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '0.5rem',
  },
  entries: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.25rem',
  },
  entry: {
    display: 'flex',
    gap: '0.5rem',
    fontSize: '0.8125rem',
  },
  time: {
    color: '#a1a1aa',
    fontFamily: 'monospace',
    fontSize: '0.75rem',
  },
  message: {
    color: '#52525b',
  },
}
