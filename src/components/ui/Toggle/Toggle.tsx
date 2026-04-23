import type { ChangeEventHandler } from 'react'
import styles from './Toggle.module.css'

type ToggleProps = {
  checked: boolean
  disabled?: boolean
  label: string
  onChange: ChangeEventHandler<HTMLInputElement>
}

export function Toggle({ checked, disabled = false, label, onChange }: ToggleProps) {
  return (
    <label className={styles.toggleOption}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
      <span aria-hidden="true" />
      {label}
    </label>
  )
}
