import styles from '../App.module.css'
import { cx } from '../styles'

export type SegmentedControlOption = {
  label: string
  value: string
}

export type SegmentedControlProps = {
  ariaLabel: string
  options: SegmentedControlOption[]
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}

export function SegmentedControl({ ariaLabel, disabled = false, onChange, options, value }: SegmentedControlProps) {
  return (
    <div className={styles.segmentedControl} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          className={cx(styles.segmentButton, option.value === value && styles.activeSegment)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
