import styles from './SelectField.module.css'

export type SelectFieldOption = {
  label: string
  value: string
}

export type SelectFieldProps = {
  label: string
  options: SelectFieldOption[]
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}

export function SelectField({ disabled = false, label, onChange, options, value }: SelectFieldProps) {
  return (
    <label className={styles.selectField}>
      <span>{label}</span>
      <select
        className={styles.selectInput}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
