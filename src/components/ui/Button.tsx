import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from '../App.module.css'
import { cx } from '../styles'

export type ButtonVariant = 'default' | 'primary'
export type ButtonSize = 'default' | 'icon' | 'wide'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  size?: ButtonSize
  variant?: ButtonVariant
}

export function Button({ children, className, size = 'default', type = 'button', variant = 'default', ...props }: ButtonProps) {
  return (
    <button
      className={cx(
        styles.button,
        variant === 'primary' && styles.primaryButton,
        size === 'icon' && styles.iconButton,
        size === 'wide' && styles.wideButton,
        className,
      )}
      type={type}
      {...props}
    >
      {children}
    </button>
  )
}
