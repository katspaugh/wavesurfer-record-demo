import type { ButtonProps } from './Button'
import { Button } from './Button'

type IconButtonProps = Omit<ButtonProps, 'aria-label' | 'children' | 'size'> & {
  'aria-label': string
  children: ButtonProps['children']
}

export function IconButton(props: IconButtonProps) {
  return <Button size="icon" {...props} />
}
