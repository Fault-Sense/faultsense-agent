import { useState } from 'react'

const steps = [
  {
    id: 1,
    title: 'Add a todo',
    description: 'Type something in the input above and click Add.',
    hint: 'Try adding "SLOW" to see the SLA timeout demo (500ms timeout, 2s delay).',
  },
  {
    id: 2,
    title: 'Mark it complete',
    description: 'Click the checkbox to toggle completion.',
    hint: 'The edit button disables when a todo is completed.',
  },
  {
    id: 3,
    title: 'Delete a todo',
    description: 'Click Delete to remove it.',
    hint: 'Add "FAIL" to see the conditional error assertion.',
  },
]

export function GettingStarted() {
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const markComplete = (stepId: number) => {
    setCompletedSteps((prev) => new Set([...prev, stepId]))
  }

  const allDone = completedSteps.size === steps.length

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Getting Started</span>
        <button
          style={styles.dismissBtn}
          onClick={() => setDismissed(true)}
        >
          ×
        </button>
      </div>
      <div style={styles.steps}>
        {steps.map((step) => {
          const isComplete = completedSteps.has(step.id)
          const isActive = !isComplete && (step.id === 1 || completedSteps.has(step.id - 1))

          return (
            <div
              key={step.id}
              className={`getting-started-step${isComplete ? ' complete' : ''}`}
              style={{
                ...styles.step,
                ...(isComplete ? styles.stepComplete : {}),
                ...(!isActive && !isComplete ? styles.stepLocked : {}),
              }}
            >
              <div style={styles.stepHeader}>
                <span style={{
                  ...styles.stepNumber,
                  ...(isComplete ? styles.stepNumberComplete : {}),
                }}>
                  {isComplete ? '✓' : step.id}
                </span>
                <span style={styles.stepTitle}>{step.title}</span>
              </div>
              {isActive && (
                <div style={styles.stepBody}>
                  <p style={styles.stepDesc}>{step.description}</p>
                  <p style={styles.stepHint}>{step.hint}</p>
                  {/* fs-assert: Clicking "Done" marks the step complete.
                      Step 2+ use fs-assert-after to validate the previous step
                      was completed first — sequence validation. */}
                  <button
                    style={styles.doneBtn}
                    onClick={() => markComplete(step.id)}
                    fs-assert={`guide/step-${step.id}`}
                    fs-trigger="click"
                    fs-assert-added={`.getting-started-step.complete[count=${step.id}]`}
                    {...(step.id > 1 ? {
                      'fs-assert-after': `guide/step-${step.id - 1}`,
                    } : {})}
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {allDone && (
        <div style={styles.allDone}>
          All done! You've completed the getting started guide.
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    border: '1px solid #e0e7ff',
    borderRadius: 8,
    padding: '1rem',
    backgroundColor: '#f5f7ff',
    marginBottom: '1.5rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
  },
  title: {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: '#4338ca',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  dismissBtn: {
    background: 'none',
    border: 'none',
    fontSize: '1.25rem',
    color: '#a1a1aa',
    cursor: 'pointer',
    padding: '0 0.25rem',
    lineHeight: 1,
  },
  steps: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
  },
  step: {
    padding: '0.625rem 0.75rem',
    borderRadius: 6,
    border: '1px solid #e0e7ff',
    backgroundColor: '#fff',
  },
  stepComplete: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  stepLocked: {
    opacity: 0.5,
  },
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    backgroundColor: '#e0e7ff',
    color: '#4338ca',
    fontSize: '0.75rem',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumberComplete: {
    backgroundColor: '#bbf7d0',
    color: '#16a34a',
  },
  stepTitle: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#1a1a1a',
  },
  stepBody: {
    marginTop: '0.5rem',
    marginLeft: '1.875rem',
  },
  stepDesc: {
    fontSize: '0.8125rem',
    color: '#52525b',
    margin: '0 0 0.25rem',
  },
  stepHint: {
    fontSize: '0.75rem',
    color: '#a1a1aa',
    fontStyle: 'italic' as const,
    margin: '0 0 0.5rem',
  },
  doneBtn: {
    padding: '0.25rem 0.75rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#4338ca',
    backgroundColor: '#e0e7ff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  },
  allDone: {
    marginTop: '0.75rem',
    padding: '0.5rem 0.75rem',
    backgroundColor: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 6,
    fontSize: '0.8125rem',
    color: '#16a34a',
    textAlign: 'center' as const,
  },
}
