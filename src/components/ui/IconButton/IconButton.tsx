import type { ButtonProps } from '../Button'
import { Button } from '../Button'
import styles from './IconButton.module.css'

type IconButtonProps = Omit<ButtonProps, 'aria-label' | 'children' | 'size'> & {
  'aria-label': string
  children: ButtonProps['children']
}

export function IconButton(props: IconButtonProps) {
  return <Button className={styles.iconButton} size="icon" {...props} />
}
